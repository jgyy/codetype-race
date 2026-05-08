# Phase 15 — Observability v2 (OpenTelemetry)

## Goal

Replace the current ad-hoc logging + EMF metrics with a coherent observability stack built around **OpenTelemetry**, giving:

- **Distributed traces** that connect a click in the browser → HTTP → command bus → DDB write → DDB Stream → broadcast Lambda → WS push back to the same browser, all under one trace id.
- **RED metrics** (Rate, Errors, Duration) for every command/query, every Lambda handler, and every external dependency.
- **Structured logs** with consistent fields, correlated to trace + span ids, queryable in CloudWatch Logs Insights.
- **Service map** auto-generated from the trace data (X-Ray Service Map + a custom Mermaid generator for `docs/architecture.md`).

This is the foundation for everything else — performance tuning (Phase 16), incident response, and the comparator-style verifications used in Phase 14.

## Motivation

- Today, debugging a race involves greping `console.log` lines across 5 Lambdas with no shared correlation id. We have *some* request id propagation but no causality across the WS / stream boundary.
- EMF metrics work but only emit single-dimensional counters. We need histograms (latency p50/p95/p99) and dimension-aware filters (per route, per user-tier, per region).
- A trace lets us see where the 250 ms in `FinishRace` actually goes — Zod parse, DDB Transact, broadcast push, etc. — without instrumenting each line by hand.

## Scope

### In

- **OTel SDK** (`@opentelemetry/sdk-node`) initialised in every Lambda via a small layer.
- **Auto-instrumentation** for AWS SDK (DDB, S3, APIGW Mgmt API), HTTP, undici/fetch.
- **Manual spans** for command-bus dispatch, query-bus dispatch, projection reduce, anti-cheat heuristics.
- **Trace context propagation** end-to-end:
  - Browser → HTTP via `traceparent` header.
  - HTTP → DDB Streams via a `traceparent` attribute on the events themselves.
  - DDB Stream consumer → WS broadcast via `traceparent` field on the message envelope.
  - Browser receives `traceparent` and continues the trace on the receiving side (front-end web vitals span linked).
- **Exporters**:
  - Traces → AWS X-Ray (already free for a generous budget).
  - Metrics → CloudWatch via the OTel CloudWatch exporter (EMF format for compatibility).
  - Logs → CloudWatch Logs (existing) but with `traceId` and `spanId` injected into every line.
- **Frontend RUM**: `@opentelemetry/sdk-trace-web` for page-load and click-to-render timings, sampled at 5%.
- **CloudWatch dashboards**:
  - "Request flow" — RED for the four bus operations users care about (CreateRoom, JoinRoom, FinishRace, GetLeaderboard).
  - "WS infra" — connection counts, broadcast latency, iterator-age.
  - "Cost watch" — DDB consumed RCU/WCU per table per region.
- **Alarms** standardised:
  - p99 latency per route exceeding budget for 3 consecutive 5-min windows.
  - Error rate > 1% per route.
  - Iterator-age > 60 s on any stream Lambda.
- **OnCall runbook** entries linked from every alarm (Markdown in `docs/runbooks/`).

### Out

- Datadog, Honeycomb, New Relic, Lightstep — keep cost zero, X-Ray-only.
- Profiling (CPU/heap) — out of scope.
- SLO/SLA framework with error budgets — defer to a follow-up.
- Real-user monitoring beyond basic web-vitals (no session replay).

## Architecture

```
Browser                       APIGW HTTP                    Lambda                            DDB
─────────                     ──────────                    ──────                            ────
fetch('/rooms')  ─traceparent─►  trace ─► Lambda init      OTel SDK   ──aws-sdk-otel──►       Put
                                          start span        record     instrumentation        op
                                          'http POST /rooms' span
                                                                                              │
                                                                                              ▼ (Stream)
                                                                                              ┌─ Lambda
                                                                                              │  re-extract
                                                                                              │  traceparent
                                                                                              │  from event
                                                                                              │  attribute
                                                                                              ▼
                                                                                              ┌─ APIGW WS
                                                                                              │  send {tp:...}
                                                                                              ▼
Browser ◄──── traceparent received in WS message envelope, browser starts a child span 'ws:RACE_STARTED'
```

### Why OTel and not just X-Ray SDK?

- OTel is vendor-neutral; if we ever leave AWS, instrumentation stays.
- OTel has richer Node.js auto-instrumentation than the X-Ray SDK.
- OTel supports `Counter`/`Histogram`/`Gauge` (the RED + USE primitives) out-of-the-box. EMF requires manual format calls.

### Lambda layer

A small "otel-layer" Lambda layer is published per env:

- Contents: `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, `@aws/aws-otel-collector` (sidecar) — pinned versions.
- Bundled into a zip in CDK at `infra/layers/otel/`.
- Attached to every Lambda via `addLayers([otelLayer])`.
- Layer exposes a 200-line bootstrap (`/opt/otel/bootstrap.js`) that initialises the SDK before the handler module loads — pre-handler init is the only way to capture the cold-start span.

Cold-start overhead measured target: **+40–80 ms** for SDK init on a fresh container, **0 ms** thereafter.

### Sampling

- Server: tail-based via the OTel collector — sample 100% of error traces, 100% of slow (>1 s) traces, 5% of normal.
- Client: head-based 5% per session, 100% if a `?trace=on` query is present (debug aid).
- Critical commands (`FinishRace`, `RegisterForTournament`) always sampled.

## Span taxonomy

| Span | Kind | Attributes |
|---|---|---|
| `http.<METHOD>:<route>` | server | route, status, userId? |
| `ws.<event>` | server | event, connId, roomId? |
| `bus.command:<name>` | internal | commandId, name, attempt |
| `bus.query:<name>` | internal | name |
| `repo.<entity>.<op>` | client | entity, op, table |
| `ddb.<TransactWriteItems\|Query\|Update>` | client (auto) | table, item count |
| `s3.<op>` | client (auto) | bucket, key |
| `apigw.postToConnection` | client (auto) | connId |
| `domain.reduce` | internal | eventCount |
| `domain.elo.delta` | internal | k, ratingDiff |
| `frontend.page-load` | client (web) | route, ttfb, fcp, lcp |
| `frontend.action:<name>` | client (web) | name (e.g. `host:create-room`) |

### Span attributes — required minimums

- `service.name` — `codetype-<role>` (e.g. `codetype-http`, `codetype-ws`, `codetype-stream`).
- `service.version` — git SHA short.
- `deployment.environment` — `dev` | `staging` | `prod`.
- `http.user_agent`, `http.client_ip` (server spans only).
- `enduser.id` — Cognito sub if present (PII hashed for analytics export — never raw).

## Metrics

### Counters

- `app.commands.total{name, outcome}` — outcome ∈ ok / error.
- `app.queries.total{name, outcome}`.
- `app.events.appended{type}` — Phase 14 event store throughput.
- `app.flags.raised{reason}` — anti-cheat.

### Histograms

- `app.command.duration_ms{name}`.
- `app.query.duration_ms{name}`.
- `app.broadcast.fanout_size{room_kind}`.
- `app.cursor.coalesce_size` — events per 50 ms window.

### Gauges

- `app.ws.connections` — sampled every 60 s by a small cron.
- `app.outbox.pending` — Phase 14 outbox depth.

### Naming convention

- Lowercase, dot-separated, units suffixed (`_ms`, `_bytes`, `_count`).
- Unit-correct: durations always in milliseconds; sizes always in bytes.
- Cardinality cap: never include `userId`, `roomId`, or any unbounded id as a metric label. Those go on spans, not metrics.

## Logging

Standard log line shape (JSON):

```json
{
  "ts": "2026-05-08T08:14:11.123Z",
  "level": "info",
  "msg": "Room created",
  "service": "codetype-http",
  "trace_id": "0af7651916cd43dd8448eb211c80319c",
  "span_id": "b7ad6b7169203331",
  "userId": "u_abc",
  "roomId": "r_xyz",
  "commandId": "cmd_123"
}
```

`structuredLogger.ts` reads the active OTel context and injects `trace_id` + `span_id` automatically. Existing `withHttp` middleware swaps to the new logger.

CloudWatch Logs Insights queries (saved):

- "Errors in last 1h grouped by route":
  ```
  fields @timestamp, msg, route, error.message
  | filter level = 'error' and service like 'codetype-'
  | stats count() by route
  | sort count desc
  ```

## Frontend RUM

Minimal: `web/src/lib/otel.ts` initialises `WebTracerProvider` with a `BatchSpanProcessor`:

- Traces page navigation, fetches, and click-to-render for key actions (`host:create`, `room:join`, `race:start`).
- Exports to a Lambda-fronted OTLP/HTTP endpoint (`POST /v1/traces`) which forwards to the X-Ray exporter. (CloudFront in front, with origin Lambda; a 50 ms p99 budget on this endpoint.)
- No PII captured. UA strings are stripped to family + major version.

Trace continuity across WS:

- Browser starts a span on user action; it injects `traceparent` into the WS `EVENT_APPEND` payload-envelope (top level).
- Server-side WS handler reads it and continues the same trace.
- On the response WS push, server attaches `traceparent`; browser starts a child span receiving it. This closes the loop.

## Alarms (standardised)

| Alarm | Condition | Severity |
|---|---|---|
| `route.<r>.p99_latency` | p99 > budget for 3×5 m | warn (>1×budget), page (>2×budget) |
| `route.<r>.error_rate` | error_rate > 1% for 5 m | page |
| `stream.<x>.iterator_age` | > 60 s for 5 m | page |
| `outbox.pending` | > 1000 for 5 m | page |
| `ddb.throttle` | any UserError throttling for 5 m | page |
| `ws.connections.delta` | abrupt drop > 30% in 1 m | warn (could be infra) |
| `apigw.5xx` | > 0.5% for 10 m | page |
| `cold_start.p99` | > 1.5 s for 10 m | warn |

Each alarm links to a runbook entry in `docs/runbooks/<alarm-id>.md` describing: owner, dashboards, first-response steps, escalation.

## Trace-driven cost

Spans + metrics + logs all flow through CloudWatch. Costs:

- Logs ingest: ~$0.50/GB; existing logs already at ~5 GB/mo, expect +20% overhead.
- X-Ray traces: 100,000 free/mo, then $5/M; sampling keeps us inside free tier.
- CloudWatch metrics: $0.30/metric/month — keep total custom metrics under 100 (we have ~25 today).

## Frontend changes

- `web/src/lib/otel.ts` — RUM init.
- `web/src/lib/wsClient.ts` — inject/extract `traceparent` on each message.
- `web/src/components/_layout.tsx` — start root span on navigation.
- New `<TraceLink>` debug component shown in dev: bottom-right corner shows current trace id + click-to-copy. Hidden in prod.

## Backend changes

- `lambdas/src/otel.ts` — single-import bootstrap. All handlers `import './otel'` first line.
- `lambdas/src/middleware.ts` — wrap handler in a server-kind root span if not already created by auto-instrumentation; inject `userId`/`roomId` attributes.
- `app/src/bus/{Command,Query}Bus.ts` — wrap dispatch in a span; record outcome metric.
- `domain/src/services/RaceReducer.ts` — wrap `reduce()` in `domain.reduce` span (zero-arg span helper, no domain dep on OTel: a function-pointer `tracer` is injected).

### Domain stays clean

`@codetype/domain` must not import `@opentelemetry/*`. Instead, expose a `Tracer` port (`{ start(name): Span; end(s): void }`). The default in tests is a no-op tracer. The runtime container injects an OTel-backed tracer.

## CDK changes

```
infra/lib/observability-stack.ts        # new stack
  - X-Ray sampling rule (5% normal + 100% errors)
  - CloudWatch dashboards (Mermaid + JSON)
  - SNS topic 'oncall-pagers'
  - alarm catalogue from a single config
infra/layers/otel/                      # OTel layer source
infra/lib/codetype-stack.ts             # attach layer + otel env vars to every NodejsFunction
```

Idempotent dashboard generation: a single `dashboards.config.ts` is the source of truth; `cdk synth` regenerates dashboard JSON from it.

## Acceptance criteria

- [ ] Trace from a browser click on "Start race" → race-finished broadcast contains a single connected trace id (verified via X-Ray service map).
- [ ] All Lambda handlers emit ≥ 1 root span; no orphan child spans (CI: log assertion).
- [ ] `domain/` and `app/` layer have zero imports of `@opentelemetry/*` (CI grep gate).
- [ ] Cold-start p99 increase ≤ 100 ms vs pre-Phase-15 baseline.
- [ ] Histogram metrics produce p50/p95/p99 in the dashboard for the four critical commands.
- [ ] `traceparent` propagation works across WS round-trip; browser-side child span lists the server span as parent.
- [ ] Each alarm has a corresponding runbook file under `docs/runbooks/`; CI fails if a new alarm lacks one.
- [ ] Logs Insights query "errors by route in last hour" returns useful data (manual review).
- [ ] Sampling cost: <$10/mo X-Ray + CloudWatch additions in staging traffic profile.
- [ ] Frontend RUM endpoint p99 < 50 ms.

## Test plan

### Unit

- Tracer port no-op vs OTel-backed parity: same span structure observable.
- Logger injects trace ids when context is present.
- Sampling decision is deterministic for `?trace=on`.

### Integration

- Synthetic flow in DDB-local + WS-mock: click → finish → broadcast. Assert trace tree has expected 9 spans.
- Negative test: deliberately omit `traceparent` on WS message — server still produces a root span with no parent (orphan, but observable).

### Load / chaos

- 100 concurrent races for 10 min, observe X-Ray sampling stays within configured budget.
- Kill an OTel exporter mid-flight; verify Lambda still completes (exporter failures must not break handlers).

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| OTel SDK init slow on cold start | Pinned versions; tree-shaken layer; `--bundle` excludes auto-instrumentations we don't use. |
| X-Ray free tier exceeded | Tail-based sampling; alarm at 80% of monthly free budget. |
| Logs balloon with span ids | Logs Insights query patterns suggested in runbooks; logs auto-rotate via existing 30-day retention. |
| Trace propagation drops at the WS boundary | Contract test: every WS message envelope schema includes `traceparent` field; CI rejects schemas without it for new message types. |
| OTel exporter bug breaks handler | Exporter wrapped in try/catch; failure logs once per cold start, never throws. |
| Cardinality explosion (someone adds `userId` to a metric label) | Lint rule (custom ESLint rule) on `meter.createCounter` calls — labels must be from a fixed allowlist. |
| Sensitive data in span attributes | Sanitiser middleware: strips `Authorization`, `Cookie`, JWT bodies, and DDB `Item` payloads from auto-instrumentation spans. |

## Migration / rollout

1. Land OTel layer + bootstrap. Ship with **0% sampling** — instrumentation hot but not exporting.
2. Flip to 5% sampling, observe X-Ray cost and Lambda cold-start.
3. Wire structured logs with trace ids.
4. Build dashboards and alarms; replace the old EMF-only dashboards.
5. Decommission ad-hoc `console.log` lines that duplicate span attributes.
6. Frontend RUM — last; behind a config flag.

## Rollback

- Detach the OTel layer in CDK; redeploy. Handlers run unchanged.
- Sampling can be set to 0% via env var without a redeploy.
- Old EMF dashboards remain alongside the new ones for a 30-day overlap period.

## Estimate

8 dev-days. ~2 d layer + bootstrap, 1 d AWS-SDK auto-instrumentation tuning, 1 d bus/domain manual spans, 1 d WS context propagation, 1 d frontend RUM, 1 d dashboards/alarms/runbooks, 1 d load + chaos test.
