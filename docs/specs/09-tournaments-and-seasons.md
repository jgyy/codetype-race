# Phase 09 — Tournaments & Seasons

## Goal

Add **two parallel competitive structures** on top of the existing per-race Elo loop:

1. **Seasons** — fixed 90-day windows. Ratings *decay* toward 1200 between seasons (Glicko-style RD inflation), and each season ships its own leaderboard snapshot frozen at season-end.
2. **Tournaments** — short-lived bracketed events (single-elimination, 4–64 players) with deterministic seeding from current-season Elo, advancing automatically as matches finish.

Both must coexist with casual rooms (`code-room`) and the daily challenge without changing those flows.

## Motivation

- The current Elo system is **monotonic and unbounded** in time — a player who peaked 6 months ago retains rank against active players. Seasons create a recurring "reset moment" that re-engages lapsed users and produces a comparable, time-boxed leaderboard.
- One-off rooms have no narrative arc. Tournaments add **stakes, spectatorship, and shareable outcomes** — the "Friday 8 PM 16-player code sprint" use case at 42 Singapore.
- Both features are **read-heavy after the fact**: season standings and tournament brackets are viewed many more times than they are written. They map cleanly onto the existing single-table + GSI layout.

## Scope

### In

- `Season` entity, lifecycle (`upcoming → active → finalizing → archived`), 90-day default cadence, configurable via env.
- Soft Elo decay at season rollover: `newRating = currentRating + (1200 - currentRating) * 0.25`, RD reset to 200 (if/when we add Glicko; for now Elo-only).
- Frozen `season-leaderboard` snapshot per season per language (one row per (season, language, rank)).
- `Tournament` entity, single-elimination bracket, 4 / 8 / 16 / 32 / 64 sizes, deterministic snake seeding.
- Match orchestrator: when both finalists in a match finish a race, server advances the winner to the next match and broadcasts a `BRACKET_UPDATE` over a tournament-scoped WS.
- Tournament views: registration page, bracket view, "next-up" lobby auto-redirect.
- Admin console additions: create tournament, force-advance, disqualify (sets a `dq` flag — does *not* delete results).

### Out

- Double-elimination, Swiss, round-robin formats — explicitly deferred. Single-elim only.
- Glicko-2 migration — Elo stays. Decay formula is the only rating-system change.
- Prizes / payments / NFT-anything.
- Spectator-only chat in tournament view (reuses Phase 06 chat).
- Cross-region tournaments (single-region, ap-southeast-1, like everything else).

## Data model

### New entities (single table, prefix-keyed)

| Entity | PK | SK | GSI1PK | GSI1SK | Notes |
|---|---|---|---|---|---|
| Season | `SEASON#<id>` | `META` | `SEASON#STATUS#<status>` | `<startsAt>` | One per season; status ∈ upcoming/active/finalizing/archived |
| SeasonLeaderboardRow | `SEASON#<id>#LB#<lang>` | `RANK#<6-digit-rank>` | — | — | Frozen at finalize; lang `*` = global |
| Tournament | `TOURN#<id>` | `META` | `TOURN#STATUS#<status>` | `<startsAt>` | status ∈ registering/seeding/running/finished/cancelled |
| TournamentEntrant | `TOURN#<id>` | `ENTRANT#<userId>` | `USER#<userId>` | `TOURN#<startsAt>` | seedRank, eliminatedAt? |
| TournamentMatch | `TOURN#<id>` | `MATCH#<round>#<slot>` | `TOURN#<id>#MATCH#STATUS#<status>` | `<round>#<slot>` | status ∈ pending/live/done; players[2], winnerId?, roomId? |
| TournamentBroadcast | `TOURN#<id>` | `CONN#<connId>` | — | — | WS connection sub-table for bracket viewers (fanout) |

### Key generators (additions to `shared/src/ddb-keys.ts`)

```ts
export const seasonKey = (id: string) => ({ PK: `SEASON#${id}`, SK: 'META' });
export const seasonLbKey = (id: string, lang: string, rank: number) => ({
  PK: `SEASON#${id}#LB#${lang}`,
  SK: `RANK#${String(rank).padStart(6, '0')}`,
});
export const tournKey = (id: string) => ({ PK: `TOURN#${id}`, SK: 'META' });
export const tournEntrantKey = (id: string, userId: string) => ({
  PK: `TOURN#${id}`,
  SK: `ENTRANT#${userId}`,
});
export const tournMatchKey = (id: string, round: number, slot: number) => ({
  PK: `TOURN#${id}`,
  SK: `MATCH#${round}#${slot}`,
});
```

### GSI usage

- Existing `GSI1` is reused. No new GSI is added in this phase.
- Listing active tournaments → `GSI1PK = TOURN#STATUS#registering` ordered by `GSI1SK` (startsAt).
- "My tournaments" → `GSI1PK = USER#<userId>` filtered SK `begins_with 'TOURN#'`.
- Listing live matches needing orchestration → `GSI1PK = TOURN#<id>#MATCH#STATUS#live`.

### Zod schemas (`shared/src/schemas/tournaments.ts`)

```ts
export const SeasonStatus = z.enum(['upcoming', 'active', 'finalizing', 'archived']);
export const Season = z.object({
  id: z.string().regex(/^[0-9]{4}-S[0-9]$/), // e.g. 2026-S2
  status: SeasonStatus,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  decayFactor: z.number().min(0).max(1).default(0.25),
  decayTarget: z.number().int().default(1200),
});

export const TournStatus = z.enum(['registering', 'seeding', 'running', 'finished', 'cancelled']);
export const TournamentSize = z.union([z.literal(4), z.literal(8), z.literal(16), z.literal(32), z.literal(64)]);
export const Tournament = z.object({
  id: z.string().uuid(),
  name: z.string().min(3).max(64),
  size: TournamentSize,
  language: z.string().default('*'),
  difficulty: z.enum(['easy', 'medium', 'hard', 'any']).default('any'),
  status: TournStatus,
  startsAt: z.string().datetime(),
  registrationClosesAt: z.string().datetime(),
  seasonId: z.string(),
  hostId: z.string(),
  createdAt: z.string().datetime(),
});
export const TournamentMatch = z.object({
  tournId: z.string().uuid(),
  round: z.number().int().nonnegative(), // 0 = final, log2(size) - 1 = first round
  slot: z.number().int().nonnegative(),
  status: z.enum(['pending', 'live', 'done', 'bye']),
  players: z.tuple([z.string().nullable(), z.string().nullable()]),
  winnerId: z.string().nullable(),
  roomId: z.string().nullable(),
  scheduledAt: z.string().datetime().nullable(),
});
```

## API surface

### HTTP (under `lambdas/src/http/tournaments/`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/tournaments` | Create (admin or moderator) | Cognito + group `mod` |
| `GET` | `/tournaments?status=registering` | List | optional |
| `GET` | `/tournaments/:id` | Detail (meta + entrants count) | optional |
| `GET` | `/tournaments/:id/bracket` | Bracket tree | optional |
| `POST` | `/tournaments/:id/register` | Register self | Cognito |
| `DELETE` | `/tournaments/:id/register` | Withdraw (only while `registering`) | Cognito |
| `POST` | `/tournaments/:id/seed` | Force seed (admin) | mod |
| `POST` | `/tournaments/:id/cancel` | Cancel + refund Elo | mod |
| `GET` | `/seasons/current` | Active season metadata | optional |
| `GET` | `/seasons/:id/leaderboard?lang=ts` | Frozen leaderboard | optional |

### WebSocket (`/tourn` connection prefix on existing WS API)

- `$connect` query: `tournId=...&token=...`
- Server messages:
  - `BRACKET_INIT` — full bracket on connect.
  - `BRACKET_UPDATE` — diff after each match resolves.
  - `MATCH_READY` — sent privately to the two players; payload `{ roomId, opensInMs }`.
  - `MATCH_DONE` — public.
- Client messages: only `HEARTBEAT`. No client-driven mutations.

## Lambda layout

```
lambdas/src/http/tournaments/
  create.ts
  list.ts
  get.ts
  bracket.ts
  register.ts
  withdraw.ts
  seed.ts
  cancel.ts
lambdas/src/http/seasons/
  current.ts
  leaderboard.ts
lambdas/src/ws/tourn/
  connect.ts
  disconnect.ts
  heartbeat.ts
lambdas/src/cron/
  rolloverSeasons.ts        # runs daily 00:00 UTC; promotes status, applies decay
  advanceTournaments.ts     # runs every minute; transitions registering→seeding→running
lambdas/src/stream/
  onRaceFinished.ts         # already exists; extend to call advanceMatch() if race.tournMatchKey set
```

## Orchestration logic

### Season rollover (`rolloverSeasons.ts`)

Run daily 00:00 UTC. Reads `Season` items via GSI1 `SEASON#STATUS#active`.

For each active season where `endsAt <= now`:

1. CAS-update status `active → finalizing` (ConditionExpression `status = :active`). If conditional check fails, exit (another invocation owns it).
2. Paginate `RatingRow` GSI by language, write a `SeasonLeaderboardRow` per (lang × top-1000) into `SEASON#<id>#LB#<lang>`.
3. Apply Elo decay to every `Profile`:
   - `newRating = round(oldRating + 0.25 * (1200 - oldRating))`
   - Done in batches of 25 with `TransactWriteItems` (10 transacts × 25 items = 250 profiles per loop iteration).
   - Idempotency token: `decayAppliedFor = <seasonId>` on profile; `ConditionExpression: decayAppliedFor <> :sid`.
4. Create the next `Season` row with status `upcoming`; flip when `startsAt <= now` on the next cron tick.
5. CAS-update old season status `finalizing → archived`.

Failure mode: any step can be safely re-run because each write is idempotent on the season id.

### Tournament advancement

A match can be advanced from two triggers:

- **Stream trigger** — `onRaceFinished` already runs on `RACE#FINISHED` stream events; if `race.context.tournMatchKey` is present, it calls `advanceMatch()`.
- **Cron sweep** — `advanceTournaments` every minute scans `GSI1PK = TOURN#<id>#MATCH#STATUS#live` for matches whose room TTL has elapsed (failsafe).

`advanceMatch()` algorithm:

```
read match (SK = MATCH#<round>#<slot>)
require status == 'live' and winnerId resolved
update status = 'done', completedAt = now
parent = MATCH#<round-1>#<slot/2>
read parent
slotInParent = slot % 2
update parent.players[slotInParent] = winnerId
if parent.players both filled:
  schedule(parent)  // create room, mark live, send MATCH_READY to both players
if round == 0:
  update tournament.status = 'finished', winnerId = match.winnerId
  emit TOURN#FINISHED stream event
broadcast BRACKET_UPDATE over WS
```

All of this is one `TransactWriteItems` per advancement to keep the bracket and tournament-meta consistent.

### Seeding

Snake seeding (`1 vs N`, `2 vs N-1`, …) computed once at `registering → seeding`. Pulled deterministically from current-season Elo via the existing `RatingRow` query. If a player has no rating, they get rating 1200 (default seed → bottom half).

Byes are inserted when `entrants < size`: top seeds get a free pass to round 2 with status `bye` and an immediate auto-advance.

## Frontend

### New routes (App Router, static export — same constraints as today)

```
web/src/app/tournaments/
  page.tsx              # list (CSR-fetched)
  [id]/page.tsx         # detail + register button + bracket
  [id]/bracket/page.tsx # full-screen bracket
web/src/app/seasons/
  page.tsx              # current season summary
  [id]/page.tsx         # frozen leaderboard
```

### Components

- `<Bracket>` — pure SVG, responsive, takes `Match[]`, renders columns by round.
- `<MatchCard>` — shows two avatars, status pill, "Open lobby" CTA when `MATCH_READY` arrives for the user.
- `<TournamentTimer>` — counts down to `startsAt` / `registrationClosesAt`.
- `<SeasonRibbon>` — small banner: "Season 2026-S2 ends in 14 days · your decay -47 points".

### XState additions

A new `tournamentActor` (sibling to `wsActor`) manages bracket WS lifecycle:

```
states: idle → connecting → subscribed → reconnecting → closed
events:  CONNECT, BRACKET_INIT, BRACKET_UPDATE, MATCH_READY, ERROR, DISCONNECT
context: { tournId, bracket, myMatch }
```

When `MATCH_READY` arrives, the actor sends a `JOIN_ROOM` event up to the parent `roomMachine`, which transitions to `connecting` for the orchestrator-created room.

## Anti-cheat interaction

Tournament matches use the same anti-cheat heuristics from Phase 07. A flagged tournament finish does not auto-disqualify. Instead:

- The match status remains `live` and an entry is appended to a `mod_review_queue` partition (`PK = MOD#TOURN#<id>`, `SK = MATCH#<r>#<s>#<ts>`).
- A mod must resolve via admin console before the bracket advances. The cron sweep will *not* force-advance flagged matches.

## Acceptance criteria

- [ ] `/tournaments` page lists all `registering` tournaments sorted by `startsAt`.
- [ ] A user can register and withdraw before `registrationClosesAt` and is rejected after.
- [ ] Seeding produces a deterministic bracket given the same entrant set + ratings (golden test).
- [ ] When two players in a `live` match finish, the bracket updates within ≤2 s on a connected viewer's screen.
- [ ] Round 0 winner causes `tournament.status = 'finished'` and a `TOURN#FINISHED` stream event is emitted exactly once.
- [ ] Re-invoking `rolloverSeasons` after a partial run re-applies decay to no profile twice (idempotency check via `decayAppliedFor`).
- [ ] Frozen season leaderboard rows are read-only; an attempt to overwrite `RANK#000001` of an `archived` season is rejected by a CAS guard.
- [ ] Cancelling a `running` tournament reverts entrants' rating deltas (idempotent reverse-Elo) and refunds via `TransactWriteItems`.
- [ ] CDK synth produces no new GSIs.
- [ ] CloudFront cache: `/tournaments` JSON is `Cache-Control: public, s-maxage=10`. `/seasons/:id/leaderboard` for `archived` seasons is `s-maxage=86400`.

## Test plan

### Unit

- `shared/src/seeding.ts` — snake-seed for size 4/8/16, including bye distribution.
- `shared/src/decay.ts` — decay formula edge cases (rating 800, 1200, 1900, 2400).
- `lambdas/tests/tournaments/advanceMatch.test.ts` — round transitions, double-finish race condition (second finish must be a no-op via CAS).
- `lambdas/tests/cron/rolloverSeasons.test.ts` — partial-run resumption.

### Integration (DDB local)

- Full registration → seeding → 3-round play → finish, with mocked race results injected via `onRaceFinished`.
- Two simultaneous match advancements writing to the same parent match — only one wins; the loser retries cleanly.

### E2E (Playwright)

- 4-player tournament happy path. Use a "fast clock" knob in dev that rounds match length to 5 s for test runs.

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| Lambda-level race when two finishers arrive simultaneously | All match-state writes use `ConditionExpression` on `status` and `winnerId`. Second writer fails cleanly. |
| WS broadcast backpressure for popular tournaments (1000+ viewers) | Fan-out via the existing connection sub-table; if connection count > 250 per tournament, switch to SNS-fanout (deferred — flagged in spec but not built). |
| Decay applied twice on retry | `decayAppliedFor` per-profile sentinel + `ConditionExpression`. |
| Seeding non-determinism if ratings change mid-seed | Snapshot all entrant ratings into the `Tournament` item at seeding-start. Seeding reads from snapshot, never live. |
| Mod queue backlog blocks bracket | Default SLA: mod must resolve within 30 min; otherwise auto-advance with a `flagged: true` marker on the match (alarmed). |

## Migration / rollout

1. Deploy schemas + handlers behind a feature flag `ENABLE_TOURNAMENTS=false`.
2. Backfill: create Season `2026-S1` row covering current rolling 90-day window so the season ribbon has something to display.
3. Internal tournament for the dev team (size 4) before public launch.
4. Flip flag, announce.

## Rollback

- `ENABLE_TOURNAMENTS=false` hides UI and rejects mutating endpoints with 503.
- Data left in DDB is harmless (key-prefixed, no PK collisions with existing entities).
- The `rolloverSeasons` cron is idempotent — disabling it stops decay; enabling again resumes from where it stopped.

## Estimate

8 dev-days, 1 reviewer-day. Roughly: 2 d data layer + cron, 2 d match orchestrator, 2 d frontend bracket + WS, 1 d admin console, 1 d tests + Playwright.
