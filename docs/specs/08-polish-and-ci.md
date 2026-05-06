# Phase 08 — Polish & CI

## Goal

Lock in quality gates so the velocity gained from earlier phases doesn't decay. Add E2E coverage, CI parallelism, and operational visibility.

---

## CI parallelization

### `.github/workflows/ci.yml`

Replace any single-job CI with four parallel jobs sharing a Bun cache:

| Job | Steps |
|---|---|
| `shared` | install · `bun --filter @codetype/shared test` · `tsc --noEmit` |
| `lambdas` | install · `bun --filter @codetype/lambdas test` · `tsc --noEmit` |
| `web` | install · `bun --filter @codetype/web lint` · `bun --filter @codetype/web test` · `bun --filter @codetype/web build` |
| `infra` | install · `bun --filter @codetype/infra exec cdk synth` · cdk-nag check |

Final `merge-gate` job depends on all four; PR cannot merge until green.

### Cache key

`bun-${{ hashFiles('**/bun.lock') }}` — already present per package; root cache pools all.

---

## End-to-end tests

### Tooling

Playwright in `web/e2e/`. Tests target a deployed preview environment (one CDK stack per PR via `--context env=pr-<num>`) **or** local dev for fast feedback.

### Test scenarios

1. **Happy path race:** host creates room, second tab joins, both finish; assert podium order matches finish time.
2. **Spectator:** third tab joins as spectator; verify it sees cursors but cannot type; not on podium.
3. **Rematch:** click rematch on podium; new room with same players auto-loads.
4. **Practice mode:** unauth user runs practice; finish triggers podium.
5. **Daily:** authed user submits daily; leaderboard updates.
6. **Reconnect:** kill WS mid-race (force close), assert reconnect lands back into `racing` with state intact.

Run on PRs against preview env; on `main` against staging.

---

## Observability

### CloudWatch

- `infra/lib/monitoring-stack.ts` — new stack:
  - Dashboard with widgets: WS active connections, broadcast lag (publish→subscribe), Lambda errors per route, p95 latency per route, daily flag rate (anti-cheat).
  - Alarms: error rate >2% over 5min, broadcast lag p95 >2s, Lambda throttles >0.

### Structured logging

- Middleware (Phase 03) already emits `{requestId, route, status, ms}`.
- Add `feature` tag on each handler:
  ```ts
  log.tag('feature', 'profile')
  ```
- Use CloudWatch Logs Insights queries (saved):
  - "Errors by route last 24h"
  - "Slow handlers p99"
  - "Anti-cheat flags by day"

### Metrics (EMF)

Embed CloudWatch metrics in logs:
- `RaceFinished` (count + duration histogram)
- `ChatRateLimited` (count)
- `AntiCheatFlag` (count, by signal code)
- `WsReconnect` (count)

---

## Lighthouse / performance

### Acceptance gates

- Web LCP < 2.5s on `/` and `/practice`.
- Lighthouse a11y ≥ 95 on all routes.
- Bundle size budget: page JS ≤ 200KB gzipped.

### Tooling

- `@lhci/cli` runs against PR previews.
- Fail PR if budgets regress >10%.

---

## Documentation

- Update `README.md`:
  - New scripts section reflecting workspaces (`bun --filter ...`).
  - Architecture diagram (mermaid) under "Repo layout".
  - Link to `docs/specs/` for ongoing work.
- `docs/architecture.md`:
  - Sequence diagram: HTTP request → middleware → repo → DDB.
  - Sequence diagram: WS message → handler → DDB → stream → broadcast.
  - State chart from Phase 04.

---

## Acceptance criteria

- [ ] CI: 4 parallel jobs + merge gate, average green time <5 min on cached run.
- [ ] Playwright suite green on every PR; flake rate <2% over 50 runs.
- [ ] CloudWatch dashboard exists in production account.
- [ ] All alarms wired to a notification target (SNS topic; email or Slack).
- [ ] Lighthouse CI runs on PRs; budgets enforced.
- [ ] README updated; architecture doc exists.

---

## Test plan

- Manually trigger each alarm condition (e.g. force a 500 spike via temporary handler change in a sandbox stack); confirm alarm fires.
- Run Playwright suite 50× to measure flake rate before declaring green.

---

## Risks / mitigations

- **Risk:** Per-PR preview stacks blow up AWS costs.
  - **Mitigation:** auto-destroy on PR close; nightly cleanup Lambda for orphaned PR stacks.
- **Risk:** Playwright tests against deployed env are slow → developer friction.
  - **Mitigation:** local-mode (against `bun dev` + LocalStack) for fast iteration; full preview only on push.
- **Risk:** Flaky WS tests in Playwright.
  - **Mitigation:** explicit `waitForCondition` helpers, no fixed sleeps; retry-once policy on known-flaky network races.

## Estimate

1 week.
