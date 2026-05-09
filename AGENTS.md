# AGENTS.md — codetype-race

Companion to [`README.md`](./README.md) and [`docs/B1-Builders-Programme.md`](./docs/B1-Builders-Programme.md). Satisfies the **Development Approach with AI** section of the B1 rubric for the **team / department / organisational use** category — codetype-race is a shared-resource app (rooms with 2–8 players, global + per-language Elo leaderboards, daily challenge, community snippet pool).

## 1. AI tools, services, and models

| Tool | Model(s) | Purpose |
|---|---|---|
| **Claude Code** (CLI) | Opus 4.7 (1M ctx), Sonnet 4.6 | Primary pair-programmer — multi-file refactors, the 7-phase rollout under `docs/specs/`, CDK stacks, Zod schemas. |
| **Cursor / Copilot** | GPT-class | Inline completions inside `web/` and `lambdas/`. |
| **ChatGPT / Claude.ai** | GPT-4o, Sonnet | Out-of-IDE design chats: Elo formula, anti-cheat heuristics, single-table DDB key design before committing to `shared/src/ddb-keys.ts`. |

The deployed system has **no LLM calls at runtime** — AI is dev-time only, keeping per-race cost bounded and avoiding PII exposure to third-party APIs.

## 2. AI agents — roles and skills

| Role | Skills | Where it shows up |
|---|---|---|
| **Architect** | Respect single-table DDB + `repos/*` boundary; read `docs/specs/*` before proposing. | New endpoints, `infra/lib/`. |
| **Implementer** | Schema-first: add Zod in `shared/src/schemas/` before the handler. | `lambdas/src/`, `web/src/`. |
| **Reviewer** | Flags missing Zod, direct DDB outside `repos/`, untyped WS payloads, missing EMF metrics. | Pre-commit diff pass. |
| **Test author** | Vitest colocated; Playwright for user-visible flows. | `*.test.ts`, `web/e2e/`. |
| **Cost guardian** | Watches WS fan-out, GSI scans, EventBridge frequency; preserves the 20 Hz cursor coalesce. | Hot paths in `ws/` + `stream/`. |
| **Facilitator-explainer** | Restates decisions in plain English for workshop participants. | `README.md`, commit messages. |

## 3. Key prompts

**Anti-cheat heuristics (Claude Code, Phase 6).** *"Given a finished race log of `(timestamp, charsTyped)` samples, list server-side heuristics to flag a likely paste/macro before applying Elo. Target false-positive rate < 1% on real human runs. Rank by signal strength."* Kept top 3: burst-rate variance, inter-keystroke entropy, time-to-first-keystroke. Rejected an ML classifier as overkill at current scale.

**Single-table key design (Claude.ai chat, pre-Phase 2).** *"For a multiplayer typing race with rooms, profiles, races, ratings, and a global + per-language leaderboard, design a single DynamoDB table with one GSI. Show PK/SK for each entity and which access patterns each satisfies."* Output became the contract in `shared/src/ddb-keys.ts`.

**XState lobby machine (Cursor, Phase 1).** *"Model a room as `idle → connecting → lobby → countdown → racing → finished` plus `reconnecting` and `error`, with three child actors: `wsActor`, `countdownActor`, `cursorThrottleActor`. Output the XState v5 setup."* Kept the skeleton; tightened guards by hand.

**CDK monitoring stack (Claude Code, Phase 8).** *"Emit EMF metrics from each middleware (`withHttp`/`withWs`/`withStream`) and surface a CloudWatch dashboard + alarms for p95 latency, 5xx rate, and WS broadcast errors."* Produced `infra/lib/monitoring-stack.ts` end-to-end.

## 4. Key review points and decisions

| # | Topic | AI suggestion | Decision | Why |
|---|---|---|---|---|
| 1 | DDB schema | Separate tables per entity. | **Single table + 1 GSI** via `repos/*`. | Cheaper, simpler IAM; `TransactWriteItems` keeps leaderboard + rating + history atomic. |
| 2 | Cursor broadcast | One WS message per keystroke. | **Coalesce to 20 Hz (`CURSOR_FLUSH`)**. | Per-connection write cost dominates; un-coalesced was ~10× more expensive at 8 players. |
| 3 | Auth | Hand-rolled JWT. | **Cognito + Amplify**. | Out-of-scope to harden ourselves; Cognito groups gate admin endpoints cleanly. |
| 4 | Daily challenge | Pick on first request of the day. | **EventBridge cron at 00:00 UTC**. | Deterministic, auditable, identical for all users in the window. |
| 5 | Replays | Stream events live to all spectators. | **Persist JSON to S3, replay client-side**. | Spectators don't need real-time; S3 is cheap and decouples from the live WS path. |

## 5. Operating rules for AI agents

1. All external input is **Zod-validated** — schema in `shared/src/schemas/` first, then handler. No `as Foo` casts on request bodies or WS payloads.
2. DynamoDB only via **`lambdas/src/repos/*`**. Keys come from `shared/src/ddb-keys.ts`.
3. Wrap handlers with `withHttp` / `withWs` / `withWsLifecycle` / `withStream` — they own logging, error envelopes, EMF metrics.
4. New high-frequency broadcasts need a coalescing window and an explicit budget note.
5. Profile + leaderboard + history updates go through one `TransactWriteItems`. Two sequential writes is a bug.
6. New handler ⇒ new Vitest file. New user-visible flow ⇒ Playwright spec. The 4-job CI gate + `merge-gate` must stay green.
7. No runtime LLM calls without an explicit design discussion (see §1).

## 6. Responsible-use boundaries

- **No PII in prompts** — use synthetic fixtures from `lambdas/test/fixtures/`.
- **No blind paste** — AI output is read, tested, reshaped. ≥30 unmodified lines is a flag to review again.
- **Explainability test** — every non-trivial AI-generated change ships with a one-paragraph PR note: "what the AI did, what I did."
- **Facilitator mindset** — comments and commit messages explain *why*, so a workshop participant can learn the reasoning, not just the result.
