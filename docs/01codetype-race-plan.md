# CodeType Race — Project Plan (P2: Team / Multi-User)

**Programme:** B1 Builders — Project 2 of 2
**Submission deadline:** 15 May 2026
**Target build window:** ~5–6 days (after P1 ships)

---

## Concept

Real-time multiplayer typing race for code snippets. A host creates a room, shares a 6-character join code, 2–8 players join a lobby, everyone races the same snippet at the same time, and a podium shows the winner with WPM/accuracy.

**Why it qualifies as "team / multi-user":** the room is a shared resource. Multiple users mutate the same game state concurrently (their cursor positions, completion times, room status). Reqs auth, real-time sync, and conflict-safe writes — none of which P1 needs.

**Pairing with P1:** same domain (code typing) → component reuse for the typing engine. The interesting story for the interview is *what had to change* when going from single-player to authoritative server state.

---

## Stack (AWS — cheapest serverless path)

- **Runtime / package manager:** **Bun** (used for installs, scripts, and TS execution; Lambda bundles still target Node.js 20 ARM via CDK `NodejsFunction` + esbuild)
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

Table `codetype` with composite key `(PK, SK)` and one GSI `GSI1(PK=code, SK=room_id)` for join-by-code.

| Entity     | PK                  | SK                        | Attributes |
|------------|---------------------|---------------------------|------------|
| Room       | `ROOM#{room_id}`    | `META`                    | `code`, `host_id`, `snippet_id`, `status` (`lobby`\|`running`\|`finished`), `started_at`, `finished_at` |
| Player     | `ROOM#{room_id}`    | `PLAYER#{display_name}`   | `user_id?`, `joined_at`, `finished_at?`, `gross_wpm?`, `net_wpm?`, `accuracy?`, `scaled_wpm?`, `chars_typed`, `errors`, `progress` (0–1) |
| Connection | `ROOM#{room_id}`    | `CONN#{connection_id}`    | `display_name`, `ttl` (epoch, +30s, refreshed on heartbeat) |
| Snippet    | `SNIPPET#{id}`      | `META`                    | `language`, `title`, `code` |
| CodeIndex  | `CODE#{code}`       | `ROOM#{room_id}`          | (sparse, GSI1 source) — alt: just use `GSI1PK=code` on Room item |

**Authorization (replaces RLS):**
- All writes go through Lambda — IAM policies + in-handler checks enforce: only host can mutate `status`; a player can only mutate their own `progress`/`wpm` row (matched on `connection_id → display_name`).
- Anonymous reads of `code → room_id` are allowed; reading `email` from Cognito is never exposed via API.

**Realtime channels (logical, over a single WebSocket):**
- Client sends `{ action: "cursor", progress }` → Lambda throttles + writes to player row, then `PostToConnection`s to all peers in the room. High-frequency, ephemeral.
- DynamoDB Stream on the table → Lambda → broadcasts room-status transitions and player join/leave to all `CONN#` items in that room. Replaces the Postgres-changes channel.

---

## Scoring formulas (single source of truth)

All four metrics are computed in `src/lib/scoring.ts` (pure functions, shared between client live-ticker and server `finish` Lambda — server result is authoritative).

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

```bash
# install (root manages workspace: web, infra, lambdas)
bun install

# run web app
bun run --cwd src dev

# CDK — always use the jgyy profile
bun run --cwd infra cdk -- bootstrap --profile jgyy   # one-time per account/region
bun run --cwd infra cdk -- diff      --profile jgyy
bun run --cwd infra cdk -- deploy    --profile jgyy
bun run --cwd infra cdk -- destroy   --profile jgyy
```

CI (GitHub Actions) assumes a role in the `jgyy` account via OIDC and exports the same profile shape so the commands are identical to local.

---

## Folder structure (matches B1 spec)

```
codetype-race/
├── README.md
├── LICENSE
├── .gitignore
├── package.json
├── src/
│   ├── app/
│   │   ├── (marketing)/        # landing
│   │   ├── room/[code]/        # lobby + race + podium
│   │   └── api/                # route handlers
│   ├── components/
│   │   ├── typing/             # SHARED with codetype-solo (copy initially, extract later)
│   │   ├── race/               # opponent cursors, leaderboard, podium
│   │   └── lobby/
│   ├── lib/
│   │   ├── aws/                # cognito client, ddb doc client, ws client
│   │   └── realtime/           # WS wrapper, throttled broadcast (10 Hz)
│   └── server/
├── infra/                      # AWS CDK app (one stack: S3+CF, Cognito, DDB, API GW HTTP+WS, Lambdas)
├── lambdas/                    # handler source — bundled by CDK NodejsFunction
│   ├── http/                   # createRoom, joinRoom, listHistory, ...
│   ├── ws/                     # connect, disconnect, default, cursor, start, finish
│   └── stream/                 # ddb-stream → broadcast room events
├── tests/
├── docs/
│   ├── ai-log.md
│   └── architecture.md         # MUST cover: state ownership, race conditions, room lifecycle
├── scripts/
├── assets/
└── data/
```

---

## Build sequence (6 days)

| Day | Goal | Deliverable |
|---|---|---|
| 1 | Scaffold + auth + room CRUD | Host can create a room, join code works |
| 2 | Lobby + presence | Multiple browsers see each other in lobby |
| 3 | Race start + countdown + shared snippet | Race starts simultaneously across clients |
| 4 | Live cursors + leaderboard via Realtime broadcast | Two browsers race, see each other's progress |
| 5 | Finish detection + podium + room history | Full happy path works end-to-end |
| 6 | Polish + reconnection handling + README + deploy | Shippable demo on CloudFront URL (CDK `cdk deploy` from CI) |

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
