# CodeType Race — Project Plan (P2: Team / Multi-User)

**Programme:** B1 Builders — Project 2 of 2
**Submission deadline:** 15 May 2026
**Target build window:** ~5–6 tasks (after P1 ships)

**Environment assumption:** Bun, AWS CLI (with `jgyy` profile), CDK CLI, and Node 20 are already installed locally and in CI. No install steps appear below — `bun install` inside each package is the only setup command needed.

---

## Concept

Real-time multiplayer typing race for code snippets. A host creates a room, shares a 6-character join code, 2–8 players join a lobby, everyone races the same snippet at the same time, and a podium shows the winner with WPM/accuracy.

**Why it qualifies as "team / multi-user":** the room is a shared resource. Multiple users mutate the same game state concurrently (their cursor positions, completion times, room status). Reqs auth, real-time sync, and conflict-safe writes — none of which P1 needs.

**Pairing with P1:** same domain (code typing) → component reuse for the typing engine. The interesting story for the interview is *what had to change* when going from single-player to authoritative server state.

---

## Stack (AWS — cheapest serverless path)

- **Runtime / package manager:** **Bun everywhere** — installs, scripts, TS execution, and test runner (`bun test`). Lambda bundles still target Node.js 20 ARM via CDK `NodejsFunction` + esbuild (Lambda runtime is Node, but the toolchain that produces the bundle is Bun). No `npm`, no `pnpm`, no `yarn` — `bun.lock` is the only lockfile committed.
- **Frontend:** Next.js 16 (App Router, **static export** where possible) + TypeScript + Tailwind + shadcn/ui (same as P1)
- **Hosting:** **S3 + CloudFront** for the static bundle (free tier covers demo traffic). Fallback if SSR is unavoidable: **AWS Amplify Hosting** (free tier: 1000 build min/mo, 15 GB served).
- **Backend compute:** **AWS Lambda** (Node.js 20, ARM/Graviton) behind **API Gateway HTTP API** for REST and **API Gateway WebSocket API** for realtime. Free tier: 1M Lambda req/mo + 1M API GW req/mo.
- **Realtime transport:** **API Gateway WebSocket API** + Lambda handlers (`$connect`, `$disconnect`, `$default`) + the `@connections` management endpoint for server→client pushes. No always-on server.
- **Database:** **DynamoDB on-demand** (single-table design, free tier 25 GB + 25 WCU/RCU). Stream → Lambda fan-out for "Postgres changes"-style room status broadcasts.
- **Auth:** **Amazon Cognito User Pool** with email magic link (passwordless via custom auth flow, or hosted UI). Free tier: 50k MAU. Players who join by code stay unauthenticated — display name only, signed by a short-lived JWT minted by a Lambda.
- **IaC / deploy:** **AWS CDK** (TypeScript) — one stack, deployed via `cdk deploy --profile jgyy` (locally and from GitHub Actions on push to `main` using the same named profile via OIDC-assumed role). Cheaper than Amplify if SSR isn't needed; everything lives in the free tier.

**Estimated monthly cost at demo scale (≤100 races, ≤8 players each):** $0 — fully inside the AWS Free Tier. After free tier expires (12 months), steady-state cost for an idle app is dominated by CloudFront minimums and rounds to **<$1/mo**.

**Why API Gateway WebSockets over AppSync / IoT / self-hosted Socket.IO:**
- AppSync has a managed subscriptions model but pricing leans toward $4/M messages and assumes GraphQL — overkill for this app.
- IoT Core is cheaper per message but MQTT topic ACLs are awkward for room-scoped auth.
- Self-hosting Socket.IO on EC2/Fargate has an always-on cost ($5+/mo minimum) — disqualified by the "cheapest" constraint.
- API Gateway WebSockets: $1/M connection-minutes + $1/M messages, **and the connection-minute meter is in the free tier for the first 750k**. Wins on cost at this scale.

**Trade-off vs. Supabase:** no built-in presence or Postgres-changes channel — we build presence by storing `connectionId → (room_code, display_name)` in DynamoDB with a TTL, and fan out room events via DynamoDB Streams → Lambda → `PostToConnection`. More code, but the realtime layer becomes a thing *we* designed (better interview story).

---

## Core features (must-have for submission)

1. **Create room** — host signs in, picks language + snippet, gets a 6-char join code.
2. **Join room** — anyone with the code joins via display name (auth optional for players).
3. **Lobby** — live presence list, host can start when ≥2 players.
4. **Countdown** → race starts → everyone types the same snippet.
5. **Live opponent cursors** — see other players' progress as a coloured bar per player.
6. **Live leaderboard** — sorted by % progress, updates in realtime.
7. **Finish & podium** — first 3 players highlighted; final WPM/accuracy per player.
8. **Room history** — host can view past races in their room.

## Stretch (only if ahead of schedule)

- Best-of-3 series mode.
- Spectator mode (read-only, no typing).
- Per-room ELO ranking.

---

## Data model (DynamoDB single-table)

One table, `codetype`, on-demand billing, point-in-time recovery on. Composite primary key `(PK, SK)` plus one GSI `GSI1(GSI1PK, GSI1SK)` for join-by-code lookups. All entity types live in the same table — this is canonical AWS single-table design and keeps reads to one RCU per fetch.

**Item shapes (all attributes shown — `?` = optional):**

| Entity     | PK                  | SK                        | GSI1PK         | GSI1SK              | Attributes |
|------------|---------------------|---------------------------|----------------|---------------------|------------|
| Room       | `ROOM#{room_id}`    | `META`                    | `CODE#{code}`  | `ROOM#{room_id}`    | `room_id` (uuid v7), `code` (6-char base32, no `0/O/1/I`), `host_id` (Cognito sub), `snippet_id`, `status` (`lobby`\|`countdown`\|`running`\|`finished`), `created_at`, `started_at?`, `finished_at?`, `version` (number, used for optimistic locking on status transitions) |
| Player     | `ROOM#{room_id}`    | `PLAYER#{display_name}`   | —              | —                   | `display_name`, `user_id?`, `joined_at`, `finished_at?`, `gross_wpm?`, `net_wpm?`, `accuracy?`, `scaled_wpm?`, `chars_typed` (default 0), `errors` (default 0), `progress` (0–1, default 0), `is_dnf?` (bool) |
| Connection | `ROOM#{room_id}`    | `CONN#{connection_id}`    | `CONN#{connection_id}` | `ROOM#{room_id}` | `connection_id`, `display_name`, `joined_at`, `ttl` (epoch seconds, +30s, refreshed by client heartbeat; DDB TTL attribute = `ttl`) |
| Snippet    | `SNIPPET#{id}`      | `META`                    | `LANG#{language}` | `SNIPPET#{id}`   | `snippet_id`, `language`, `title`, `code` (the literal text to type), `length` (chars) |
| RaceResult | `ROOM#{room_id}`    | `RESULT#{finished_at}#{display_name}` | `HOST#{host_id}` | `FINISHED#{finished_at}` | snapshot of final Player row at finish, immutable. Used for room history without mutating live `PLAYER#` items. |

**Why these key choices:**
- All items inside one room share `PK=ROOM#{room_id}`, so the lobby state, all players, all live connections, and the history rows for that room come back from a single `Query(PK=ROOM#{room_id})` — one RCU window, one network round trip, no scatter-gather.
- `GSI1` carries two unrelated lookup needs on the same index by partitioning on type-prefixed keys: `CODE#{code} → ROOM#{room_id}` for join-by-code, and `CONN#{connection_id} → ROOM#{room_id}` for the `$disconnect` handler (which only knows the connection id). This keeps GSI count at 1 (cheaper, fewer eventual-consistency surprises) at the cost of slightly less obvious key design.
- `RaceResult` items are append-only and live forever; `Player` items churn during a race. Splitting them means history reads don't compete with live cursor writes on the same item.
- `version` on Room enables conditional writes for `lobby → countdown → running → finished` transitions: `UpdateItem` with `ConditionExpression: status = :expected AND version = :v` — protects against double-start when two clients click "Start" in the same second.

**Capacity & cost:**
- On-demand billing — no capacity planning, free tier covers 25 GB + 25 WCU/RCU equivalent of on-demand usage for the demo.
- TTL on `Connection` items auto-cleans stale connection rows within ~48 h even if `$disconnect` never fires (which happens on hard network drops). This is a backstop, not the primary cleanup path.
- DynamoDB Streams enabled with `NEW_AND_OLD_IMAGES` — the stream Lambda needs the old image to detect status transitions (`OldImage.status = lobby` AND `NewImage.status = countdown`) without re-reading the table.

**Authorization (replaces Supabase RLS):**
- All writes go through Lambda. Lambda IAM execution roles are scoped per handler — e.g. the `cursor` Lambda has `dynamodb:UpdateItem` only, scoped via `Condition: { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["ROOM#*"] } }`, and only on attributes `progress, chars_typed, errors`. It cannot touch `status` or any other player's row.
- In-handler checks layered on top of IAM: every WS handler resolves `connectionId → (room_id, display_name)` from the `Connection` item, then asserts the requested mutation matches that identity. A connection cannot mutate another player's row even if it spoofs the `display_name` in the message body.
- Only the player whose `user_id == Room.host_id` can call `start` and transition `status`. Verified server-side from the Cognito-issued JWT in the WS connect query string (validated at `$connect`).
- Anonymous reads: a `GET /room/{code}` endpoint returns `{ room_id, status, snippet_id }` — enough for the join page to render — but never exposes `host_id`, `email`, or other player rows. Email lives only in the Cognito user pool and is never written to DynamoDB.
- Idempotency: `createRoom` and `joinRoom` accept a client-provided `idempotency_key` (uuid) stored as a conditional-write item with a 10-minute TTL — protects against double-clicks creating ghost rooms.

**Realtime channels (logical, all multiplexed over one WebSocket):**

| Channel             | Direction | Trigger                                               | Payload                                                                                  |
|---------------------|-----------|-------------------------------------------------------|------------------------------------------------------------------------------------------|
| `cursor`            | client→server, then server→peers | client throttle (10 Hz max)            | `{ action: "cursor", progress: 0..1, chars_typed, errors }` — Lambda updates Player row, fans out `{ type: "cursor", display_name, progress }` to all peer connections in the same room |
| `heartbeat`         | client→server                    | every 5 s                              | `{ action: "ping" }` — Lambda refreshes `Connection.ttl = now + 30s`. No fan-out.        |
| `start`             | client→server (host only), then broadcast | host clicks Start             | server writes `status=countdown`, `started_at = server_now + 3000ms`; stream Lambda broadcasts `{ type: "start", started_at }` so every client counts down to the same absolute timestamp |
| `finish`            | client→server, then broadcast    | client detects `progress === 1`        | server validates `final_progress = snippet.length`, computes all four scores authoritatively, writes Player row + RaceResult row; stream Lambda broadcasts `{ type: "finish", display_name, scaled_wpm, net_wpm, gross_wpm, accuracy, finished_at }` |
| `room-event`        | server→clients                   | DDB Stream on Room/Player/Connection items | broadcasts join/leave/status-change; replaces Supabase Postgres-changes channel |

**DDB Stream → broadcast Lambda logic:**
1. Receive batch of stream records (max 1000, 5 s window).
2. Group records by `room_id` (parsed from `PK`).
3. For each room, query `Connection` items under that PK to get the live connection list.
4. For each meaningful change (status transition, player added/removed, finish), `PostToConnection` to every connection in the room.
5. On `GoneException` (connection already dropped), best-effort `DeleteItem` on the stale `Connection` row. Don't retry the broadcast — the disconnected client will catch up via initial state on reconnect.
6. Dead-letter queue (SQS) attached for batches that fail repeatedly — keeps free-tier usage but flags real bugs.

**Throttling & coalescing (cost-critical path):**
- Client sends at most 10 cursor messages/sec. The race lasts ~30–60 s → ~600 client messages × 8 players = 4800 inbound messages per race.
- Cursor Lambda uses execution-context reuse: an in-memory `Map<connectionId, latestProgress>` flushed every 100 ms via `setInterval` on cold start. This collapses up to 10 inbound messages into 1 fan-out per peer.
- Net per-race messages: ~4800 inbound + ~4800 fan-out × 7 peers ≈ 38k messages → still well under the 1M API GW free-tier monthly budget for the entire submission demo period.
- `PostToConnection` calls are issued in parallel (`Promise.all`), bounded at 25 in flight to avoid Lambda throttling against the management API.

**Validation & limits enforced server-side:**
- `display_name`: 1–24 chars, `[A-Za-z0-9 _-]+`, must be unique within a room (conditional `attribute_not_exists(SK)` on insert).
- Room capacity: max 8 players. `joinRoom` Lambda checks `Query(PK=ROOM#{id}, SK begins_with PLAYER#)` count before insert.
- One connection per `(room_id, display_name)`: a second connect with the same identity kicks the older connection (best-effort `PostToConnection({type:"kicked"})` then delete its row). Prevents the same browser ghosting itself.
- Snippet length: 50–800 chars. Anything outside that range is rejected at room creation — keeps races bounded between ~10 s (very short) and ~3 min (very long) for a 60 WPM typist.

---

## Scoring formulas (single source of truth)

All four metrics are computed in `shared/src/wpm.ts` (pure functions, shared between client live-ticker and server `finish` Lambda — server result is authoritative).

> 🧑 **User contribution:** the three WPM formulas (`grossWpm`, `netWpm`, `accuracy` → `scaledWpm` derives from them) are implemented by hand in `shared/src/wpm.ts`. The signatures and the `elapsed_ms`/`chars_typed`/`errors` inputs are fixed by the spec below; the *implementation* is yours. Unit tests for these formulas (boundary cases: `chars_typed === 0`, `errors > chars_typed/5`, sub-second elapsed times) are also user-written under `shared/tests/wpm.test.ts` using `bun test`.

```ts
// inputs: chars_typed (correct + incorrect keystrokes committed),
//         errors (uncorrected wrong characters at finish),
//         elapsed_ms (server_finished_at - started_at)
const minutes  = elapsed_ms / 60_000;
const grossWpm = (chars_typed / 5) / minutes;
const netWpm   = Math.max(0, ((chars_typed / 5) - errors) / minutes);
const accuracy = chars_typed === 0 ? 0 : (chars_typed - errors) / chars_typed; // 0..1
const scaledWpm = netWpm * accuracy; // composite, used for podium ranking
```

Podium sort key: `scaled_wpm DESC`, tiebreak `finished_at ASC`. All four are stored on the Player row and shown on the podium card.

---

## Local dev & deploy commands

No root `package.json`, no Bun workspaces. Each of `web/`, `infra/`, and `lambdas/` is an independent package with its own `package.json` and its own `bun.lock`. Shared code (e.g. `wpm.ts`, DDB key helpers) is duplicated by file copy or symlinked from `shared/` — not linked through a workspace protocol. Trade-off: small amount of duplication, but each package installs and deploys in isolation and the CDK bundler doesn't have to resolve workspace symlinks.

Tooling (Bun, AWS CLI with the `jgyy` profile, CDK CLI) is already installed; the commands below assume a clean working tree only.

```bash
# run web app
cd web && bun run dev

# CDK — always use the jgyy profile
cd infra
bun run cdk bootstrap --profile jgyy   # one-time per account/region
bun run cdk diff      --profile jgyy
bun run cdk deploy    --profile jgyy
bun run cdk destroy   --profile jgyy

# tests (Bun's built-in runner, no Jest/Vitest)
bun test                                # inside any package
```

CI (GitHub Actions) assumes a role in the `jgyy` account via OIDC and exports the same profile shape so the commands are identical to local.

---

## Folder structure (matches B1 spec)

Three sibling packages, each independent. No root `package.json`.

```
codetype-race/
├── README.md
├── LICENSE
├── .gitignore
├── shared/                     # plain .ts files, copied/symlinked into each package's src
│   ├── src/
│   │   ├── wpm.ts              # WPM/accuracy formulas — single source of truth (USER-WRITTEN)
│   │   ├── ddb-keys.ts         # PK/SK builders for the single-table layout
│   │   ├── streak.ts           # UTC day-boundary helpers for daily streaks (USER-WRITTEN)
│   │   └── types.ts            # Room/Player/Snippet/WSMessage types
│   └── tests/                  # bun test — wpm.test.ts, streak.test.ts (USER-WRITTEN)
├── web/                        # Next.js 16 app — its own package.json + bun.lock
│   ├── package.json
│   ├── bun.lock
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── src/
│   │   ├── app/
│   │   │   ├── (marketing)/    # landing
│   │   │   ├── room/[code]/    # lobby + race + podium
│   │   │   └── api/            # route handlers
│   │   ├── components/
│   │   │   ├── typing/         # copied from codetype-solo (P1)
│   │   │   ├── race/           # opponent cursors, leaderboard, podium
│   │   │   └── lobby/
│   │   └── lib/
│   │       ├── aws/            # cognito client, ws client (browser-side)
│   │       └── realtime/       # WS wrapper, throttled sender (10 Hz)
│   └── tests/                  # bun test
├── infra/                      # AWS CDK app — its own package.json + bun.lock
│   ├── package.json
│   ├── bun.lock
│   ├── cdk.json
│   ├── tsconfig.json
│   ├── bin/app.ts              # CDK entry
│   ├── lib/codetype-stack.ts   # one stack: S3+CF, Cognito, DDB, API GW HTTP+WS, Lambdas
│   └── tests/
├── lambdas/                    # handler source — its own package.json + bun.lock
│   ├── package.json            # deps: @aws-sdk/client-dynamodb, client-apigatewaymanagementapi
│   ├── bun.lock
│   ├── tsconfig.json
│   ├── http/                   # createRoom, joinRoom, listHistory, ...
│   ├── ws/                     # connect, disconnect, default, cursor, start, finish
│   ├── stream/                 # ddb-stream → broadcast room events
│   └── tests/
├── docs/
│   ├── ai-log.md
│   └── architecture.md         # MUST cover: state ownership, race conditions, room lifecycle
├── scripts/                    # bash/bun scripts (seed snippets, smoke tests)
├── assets/
└── data/                       # seed snippet JSON
```

**Why duplicate `shared/` instead of using a workspace?** CDK's `NodejsFunction` bundler resolves `require`/`import` against the package directory and doesn't follow workspace symlinks cleanly without extra config. With three independent packages, each one's bundle is self-contained — no `nohoist`, no `bundledDependencies` gymnastics. The duplication is ~3 small files; the CI cost saved is real.

---

## Build sequence (6 tasks)

Tasks are ordered, not time-boxed — calendar dates are unreliable for this scope. Finish each before starting the next.

| Task | Goal | Deliverable |
|---|---|---|
| 1 | Scaffold + auth + room CRUD | Host can create a room, join code works |
| 2 | Lobby + presence | Multiple browsers see each other in lobby |
| 3 | Race start + countdown + shared snippet | Race starts simultaneously across clients |
| 4 | Live cursors + leaderboard via Realtime broadcast | Two browsers race, see each other's progress |
| 5 | Finish detection + podium + room history | Full happy path works end-to-end |
| 6 | Polish + reconnection handling + README + deploy | Shippable demo on CloudFront URL (CDK `cdk deploy` from CI) |

---

## User contributions (hand-written, not AI-generated)

These four pieces are implemented by the human, not delegated to the AI. They are the load-bearing decisions where the trade-offs matter most and are the clearest signal of authorship for the interview.

1. **WPM formulas — `shared/src/wpm.ts`.** Three pure functions: `grossWpm(charsTyped, elapsedMs)`, `netWpm(charsTyped, errors, elapsedMs)`, `accuracy(charsTyped, errors)`. The composite `scaledWpm = netWpm * accuracy` is derived at call sites. Constraints: must return finite numbers for `elapsedMs > 0`, `accuracy` must be clamped to `[0, 1]`, `netWpm` floors at 0. Spec lines 129–138 are the source of truth.

2. **Live-diff render strategy in `TypingArea` — `web/src/components/typing/TypingArea.tsx`.** Render the snippet as one `<span>` per character with one of four classes — `pending`, `correct`, `incorrect`, `cursor`. On each keystroke, only the spans whose state changed are re-styled (React reconciliation handles this naturally if the key is the char index). Trade-off considered and rejected: a single `<pre>` with diff overlay (cheaper DOM, but cursor-positioning fights with monospaced kerning across browsers). The char-span approach is ~N nodes for an N-char snippet (≤800), which is well within React's comfort zone and avoids canvas/measureText hacks.

3. **Streak boundary logic — `shared/src/streak.ts`.** Daily-race streaks count consecutive **UTC** calendar days, not local-timezone days. Reason: room results store `finished_at` as epoch ms in UTC; using local time would let a player in UTC+14 and a player in UTC-12 disagree on whether the same race counted toward "today." Helpers: `utcDayKey(epochMs): string` returning `YYYY-MM-DD`, and `isConsecutiveUtcDay(prevKey, nextKey): boolean`. Edge case: a race that starts 23:59 UTC and finishes 00:01 UTC counts toward the **finish** day only.

4. **Unit tests — `shared/tests/wpm.test.ts` and `shared/tests/streak.test.ts`.** Bun's built-in test runner (`bun test`). Required cases:
   - `wpm.test.ts`: zero chars typed, errors exceeding chars, sub-second elapsed, exact 60 s elapsed, accuracy clamping at 0 and 1.
   - `streak.test.ts`: same-day twice (no increment), consecutive days (increment), one-day gap (reset), DST-equivalent crossings (no special handling needed because UTC has no DST), year boundary (`2025-12-31` → `2026-01-01`).

The `finish` Lambda imports `wpm.ts` directly so the server's authoritative score uses the exact same code paths the tests cover — there is no second implementation to drift.

---

## Hard problems (worth flagging in the interview)

1. **Server-authoritative finish time + scoring.** Clients can lie about WPM. Mitigation: the `finish` Lambda validates `final_progress = snippet.length` and computes **all four metrics server-side** from DDB-stored timestamps and the player's reported `errors` (cross-checked against final keystroke log if available):
   - `minutes = (server_finished_at - started_at) / 60_000`
   - `gross_wpm = (chars_typed / 5) / minutes` — raw speed, ignores errors
   - `net_wpm  = max(0, ((chars_typed / 5) - errors) / minutes)` — penalises uncorrected errors (Monkeytype-style)
   - `accuracy = (chars_typed - errors) / chars_typed` — fraction in [0, 1]
   - `scaled_wpm = net_wpm * accuracy` — single composite ranking metric used for the podium order; favours fast *and* accurate typists, eliminates the "spam-keys-for-high-WPM" exploit
   Client-reported values are only used for the live ticker, never for the final score or leaderboard order.
2. **Cursor broadcast volume.** 8 players × 60 keystrokes/min × N broadcasts each → message storm = $$ on API GW WS. Mitigation: client throttles to 10 Hz; cursor Lambda further coalesces using a 100 ms in-memory window per `connectionId` (Lambda execution context reuse) before fanning out via `PostToConnection`. Send `progress` (0–1) not raw cursor index.
3. **Player drops mid-race.** Mitigation: `CONN#` items have a 30 s TTL refreshed by client heartbeats; `$disconnect` handler marks DNF immediately, TTL is the safety net. Race continues as long as ≥1 player still typing.
4. **Race start sync.** Network latency means "start now" arrives at different times. Mitigation: `start` Lambda writes `started_at = server_now + 3s` to DDB; the DDB-stream broadcaster pushes that absolute timestamp to all connections; each client counts down locally to that absolute time.
5. **Stale `connectionId`s after API GW idle timeout (10 min).** Mitigation: client sends a ping every 5 minutes during lobby; `GoneException` from `PostToConnection` triggers a row cleanup.

---

## AI workflow plan (for `docs/ai-log.md`)

Same logging discipline as P1, but with extra emphasis on:

- **Prompts where the AI got concurrency wrong** (likely: race conditions, RLS holes, double-finish bugs). These are gold for the interview's *"explain what the AI did and what you did"* line.
- **Prompts where I rejected AI's first realtime architecture** (e.g., AI is likely to suggest broadcasting full game state on every keystroke; I'll override to throttle + send progress only).
- **Tools used:** opencode for code gen; manual review of all IAM policies, DDB access patterns, and Lambda authorizers; manual end-to-end testing with 2 incognito windows against the deployed CloudFront URL.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Realtime sync bugs eat 2+ days | Build the sync layer in isolation Day 2 with a tiny test page (2 cursors, no game) before integrating |
| RLS misconfig leaks private data | Write a smoke test that hits the DB as anon; assert it can't see `profiles.email` |
| Lambda cold starts hurt perceived realtime | Keep WS handlers small (<5 MB bundles, ARM, no SDK v2). `$connect` cold start is one-time per session; cursor handler stays warm during a race. Provisioned concurrency disqualified — not free. |
| AWS Free Tier expires after 12 months | Acceptable — submission is 15 May 2026, well inside the window. Post-tier steady-state for an idle app is <$1/mo. |
| Hosting >2 demo players is too risky live | Pre-record a demo GIF with 4 browsers; have a live demo with 2 as backup |

---

## Demo storyline (for interview)

1. Open two browsers side-by-side.
2. Browser A: sign in → create room → share code.
3. Browser B: join with code → display name.
4. Both in lobby → host clicks Start → 3-2-1 countdown.
5. Both type the same snippet → live cursors visible across browsers.
6. Faster browser finishes → podium screen on both.
7. Open room history → see the just-completed race.

Total demo time: ~3 minutes. Pre-record a GIF as backup.

---

## Architectural story to tell at interview

> "P1 was client-authoritative — the client computed WPM and wrote it to the DB. For P2 I had to invert that: the server owns the truth (start time, finish time, snippet content), and the client only reports progress for the live UI. The clearest sign I got the boundary right is that a player editing the network request can't cheat the leaderboard — only the live ticker."

This is the kind of concrete, specific tradeoff the Step 2 rubric is grading.
