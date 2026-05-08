# Phase 06 — Identity & Engagement

Bundles **B4 Profiles + Elo**, **B7 Race chat**, **B8 Daily challenge**.

---

## B4 — User profiles + Elo

### Data model

DynamoDB single-table additions:

| Item | PK | SK | Notes |
|---|---|---|---|
| User profile | `USER#<sub>` | `PROFILE` | rating, totals, per-language bests |
| Race history | `USER#<sub>` | `RACE#<ts>#<roomId>` | finished races; queryable by recency |
| Leaderboard global | `LEADERBOARD#GLOBAL` | `RATING#<padded>#<sub>` | GSI sorted access |
| Leaderboard lang | `LEADERBOARD#LANG#<lang>` | `RATING#<padded>#<sub>` | per-language top N |

GSI `byUserRecency` already covers history listing.

### Schemas (`@codetype/shared/schemas`)

```ts
export const UserProfileSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  rating: z.number().int(),                       // Elo, default 1000
  racesCompleted: z.number().int(),
  racesWon: z.number().int(),
  bestWpm: z.record(z.string(), z.number()),      // by language
  createdAt: z.number(),
});
```

### Elo (`@codetype/shared/elo`)

Pure function, multi-player generalization of pairwise Elo:
```ts
export interface RaceParticipant { userId: string; rating: number; finishOrder: number; }

export function computeRatingDeltas(participants: RaceParticipant[], k = 32): Record<string, number> {
  // For each pair (i, j): expected = 1 / (1 + 10^((Rj - Ri)/400))
  // Actual = 1 if i finished before j, 0.5 if tie, 0 if after.
  // Sum deltas; normalize by (n - 1).
}
```

### Backend changes

- `UserRepo.getOrCreate(sub, displayName)` — called from `withHttp` middleware on every authed request (cached in-memory per cold-start).
- `ws/finish.ts`: when last racer finishes:
  1. Build `RaceParticipant[]` from finished racers.
  2. `const deltas = computeRatingDeltas(...)`.
  3. Batch transaction: update each user's rating; append `RACE#` history items; update leaderboard items.
  4. Broadcast `results` with rating deltas included.

- New HTTP routes:
  - `GET /users/:userId` → `UserProfileSchema` + recent races (limit 20).
  - `GET /users/me` → caller's profile.
  - `GET /leaderboard?lang=&limit=` → top N from leaderboard items.

### Frontend

- `web/src/app/profile/[userId]/page.tsx` — server component fetches profile + history; client component renders WPM history chart (SVG, no chart lib needed for scope).
- `web/src/app/leaderboard/page.tsx` — table; language filter via query param.
- `Podium.tsx` shows `+12` / `−8` rating delta per finisher.
- `Nav.tsx` shows user's current rating once authed.

### Acceptance

- [ ] Finishing a race updates ratings transactionally (no partial writes).
- [ ] First-time users start at rating 1000.
- [ ] Profile page shows recent 20 races with WPM, accuracy, language, opponents.
- [ ] Leaderboard reflects rating changes within ~5s of race finish.
- [ ] Practice runs do **not** affect rating (mode flag check).

### Test plan

- `shared/tests/elo.test.ts` — known fixtures: 2-player win, 4-player full ordering, ties, rating floor/ceiling sanity.
- `lambdas/tests/handlers/finish.test.ts` — verify atomic update + leaderboard write.
- `lambdas/tests/repos/UserRepo.test.ts` — getOrCreate idempotency.

---

## B7 — Race chat

### Backend

- `ws/chat.ts` (new handler):
  - Validates `WsClientChatSchema`.
  - Rate limit: token bucket per `connectionId` (5 messages / 10s). Bucket state in DDB item `CONN#<id>` with TTL — cheap counter.
  - Broadcasts `WsServerChatSchema` to all connections in the room.
- Allowed only in `lobby` and `finished` room phases (server enforces by checking room status).

### Frontend

- `web/src/components/chat/ChatPanel.tsx` — shows last 50 messages, autoscroll, character counter.
- Slot in `Lobby.tsx` (right rail) and `Podium.tsx` (below results).
- Hidden during `racing` to avoid distraction.
- Send via `send({ type: 'CHAT_SEND', text })` to machine; machine dispatches to wsActor.

### Acceptance

- [ ] Chat works in lobby and post-race; hidden in countdown/racing.
- [ ] Server rejects messages > 280 chars or after rate limit hit.
- [ ] Spectators can chat.
- [ ] Chat history not persisted (ephemeral) — no DDB write.

### Test plan

- `lambdas/tests/handlers/chat.test.ts` — rate limit triggers `RATE_LIMITED`; oversize text rejected.
- Component test for `ChatPanel`.

### Risks

- **Toxicity:** No moderation in v1. Add report-user button stub that logs to CloudWatch for triage.

---

## B8 — Daily challenge

### Data model

| Item | PK | SK |
|---|---|---|
| Daily snippet | `DAILY#<YYYY-MM-DD>` | `META` |
| Daily run | `DAILY#<YYYY-MM-DD>` | `RUN#<paddedWpm>#<userId>` |

GSI `byDailyRank` (PK: `DAILY#<date>`, SK: `RUN#...`) — already aligned with main table by reusing PK.

### Cron

- `infra/lib/...`: `events.Rule` with `schedule.cron({ minute: '0', hour: '0' })` UTC → invokes `lambdas/cron/selectDailySnippet.ts`.
- `selectDailySnippet`: picks a snippet with weighted randomness across difficulty tiers, writes `DAILY#<date>` `META` item with `snippetId`.

### Backend HTTP

- `GET /daily` → today's snippet (cached, no auth needed for the snippet itself; auth for "your best").
- `POST /daily/submit` (auth): body `{ wpm, accuracy, durationMs, keystrokes }`. Server:
  1. Validates with anti-cheat (Phase 07; for now just sanity bounds).
  2. Writes `RUN#` item if better than current best for that user.
  3. Returns updated rank.
- `GET /daily/leaderboard?date=&limit=` → top N for date.

### Frontend

- `web/src/app/daily/page.tsx`:
  - Shows today's snippet, banner with date.
  - Single attempt per day (UI affordance; server allows multiple, keeps best).
  - Leaderboard panel below.
- Daily runs reuse practice machine with `mode: 'daily'` flag; on finish, POST to `/daily/submit`.

### Acceptance

- [ ] Cron fires once daily; new snippet item appears.
- [ ] `/daily` route works for unauth users (read-only).
- [ ] Submitting improves leaderboard rank within ~5s.
- [ ] Leaderboard shows top 100 with ties broken by submission time.

### Test plan

- `lambdas/tests/cron/selectDailySnippet.test.ts` — covers date computation, idempotency (re-run same day = no overwrite).
- `lambdas/tests/handlers/dailySubmit.test.ts` — better/worse run handling.

### Risks

- **Cron in dev/staging environments fires:** scope cron rule to prod stack only via CDK env config.
- **Snippet repetition across days:** `selectDailySnippet` excludes last 30 days from candidate pool.

---

## Cross-cutting acceptance

- [ ] All three features use schemas/middleware/repos pattern.
- [ ] CloudWatch logs include `feature: profile|chat|daily` tag for filtering.
- [ ] No leaderboard/profile reads scan the table.

## Estimate

2 weeks.
