# Phase 11 — Achievements, Quests & XP Progression

## Goal

Add a **second progression axis** orthogonal to Elo:

- **XP & Levels** — every race earns XP regardless of result. Levels grant cosmetic flair (badge frames, name colours), never gameplay advantage.
- **Achievements** — long-tail, mostly-permanent unlocks (e.g. "type a Rust snippet with 100% accuracy", "race 10 different friends in a week").
- **Quests** — daily and weekly time-boxed objectives (e.g. "finish 3 races", "score >60 WPM in TypeScript").

Implementation is **event-sourced**: an internal `progression-bus` consumes the same DDB stream the broadcast Lambda already uses, evaluates achievement and quest rules, and writes unlocks/progress as derived state. This keeps the gameplay path fast and lets us add achievements without touching room handlers.

## Motivation

- Elo is a **PvP loop** — it punishes losses and pushes some users away after a few bad sessions. XP is a **PvE loop** — it always goes up, which is the engagement glue every casual player needs.
- Achievements give the long-tail user "something to do" between rated games.
- Quests give the daily-active user a reason to return today *specifically* — the strongest known retention lever in habit-loop products.

## Scope

### In

- XP curve: `xp(level) = 100 * level^1.5`. Levels 1–60. Hard cap.
- XP earn rules:
  - 10 XP per finished race (any mode).
  - +20 XP for first race of the day (UTC).
  - +30 XP for daily challenge completion.
  - +50 XP for tournament round win.
  - +5 XP per achievement unlocked (one-off).
- ~40 achievements at launch across categories: *consistency*, *accuracy*, *language coverage*, *social*, *speed milestones*, *event participation*.
- Quest engine: 3 daily quests rotated at 00:00 UTC, 1 weekly quest rotated Mondays.
- Quest claim flow: progress auto-tracks, user must tap "Claim" to receive XP (gives a visible reward moment).
- Achievement detail panel + unlock toast.
- Profile page: XP bar, level, top-6 pinned achievements (user-selectable).

### Out

- Paid season pass / battle pass.
- Achievement trading or gifting.
- Streak-based metagame (already partially exists via `streak.ts` and is intentionally minimal).
- AI-generated achievements.
- Cosmetics shop / monetisation.

## Architecture: event-sourced progression

The existing race pipeline produces a stream record per race finalization. We extend that stream into a real **progression event log**, then reduce events into derived state.

```
              ┌─ RACE#FINISHED ──┐
DDB Streams ──┼─ ROOM#JOINED   ──┼──► progression-bus ──► AchievementEngine ──► UnlockedRow
              ├─ DAILY#DONE    ──┤                    └─► QuestEngine       ──► QuestProgressRow
              └─ TOURN#WON     ──┘                                          └─► XPLedgerRow
```

### Why event-sourced?

- **Adding an achievement is a pure-function change.** No backfill scripts, no migrations — register a rule, it evaluates against future events. For *retroactive* awards, replay events from the stream archive (S3 partitioned by date).
- **Idempotency comes free** via event ids. Each rule's evaluator writes `Unlocked#<userId>#<achievementId>` with `attribute_not_exists(SK)` — a duplicate event never double-unlocks.
- **No coupling** to room handlers. A bug in the achievement engine cannot stall a race.

### Event log persistence

DDB stream records are short-lived (24 h). For replay, mirror them to S3 via Kinesis Firehose:

- **Bucket:** `codetype-events-<env>`
- **Prefix:** `progression/year=YYYY/month=MM/day=DD/hour=HH/`
- **Format:** newline-delimited JSON, gzip.
- **Retention:** 365 days lifecycle to Glacier Deep Archive.

`@codetype/eventlog` (new shared package) defines the canonical event envelope:

```ts
export const EventEnvelope = z.object({
  id: z.string().uuid(),                  // stable across retries
  type: EventType,                         // RACE_FINISHED | ROOM_JOINED | ...
  occurredAt: z.string().datetime(),
  userId: z.string(),
  payload: z.record(z.unknown()),
  source: z.enum(['stream', 'replay', 'admin']),
});
```

## Data model

### New entities

| Entity | PK | SK | GSI1PK | GSI1SK | Notes |
|---|---|---|---|---|---|
| XPLedgerRow | `XP#<userId>` | `EV#<reverseTs>#<eventId>` | — | — | Append-only, summed periodically into `XPSummary` |
| XPSummary | `USER#<userId>` | `XP#SUMMARY` | — | — | `{ totalXp, level, currentLevelXp, nextLevelXp }` |
| AchievementDef | `ACH#DEF#<id>` | `META` | — | — | Static catalog row, hot-loaded on Lambda init |
| UnlockedRow | `USER#<userId>` | `ACH#<achievementId>` | `ACH#<achievementId>` | `<unlockedAt>` | Idempotent unlock |
| QuestDef | `QUEST#DEF#<period>#<id>` | `META` | — | — | period ∈ daily/weekly |
| QuestActive | `QUEST#ACTIVE#<period>#<rotationId>` | `Q#<id>` | — | — | The day's/week's selected quests |
| QuestProgressRow | `USER#<userId>` | `QPROG#<rotationId>#<questId>` | — | — | progress, target, claimed |
| PinnedAchievement | `USER#<userId>` | `ACHPIN#<slot>` | — | — | slot 0..5 |

### GSI use

- No new GSI in this phase.
- "Who has achievement X?" → `GSI1PK = ACH#<achievementId>`, sort by unlockedAt desc.
- "My achievements" → query `PK = USER#<userId>` filter `begins_with(SK, 'ACH#')`.

### Zod schemas (`shared/src/schemas/progression.ts`)

```ts
export const AchievementCategory = z.enum([
  'consistency', 'accuracy', 'languages', 'social', 'speed', 'events', 'meta',
]);
export const AchievementTier = z.enum(['bronze', 'silver', 'gold', 'platinum']);
export const AchievementDef = z.object({
  id: z.string().regex(/^[a-z0-9_]{3,40}$/),
  title: z.string().min(3).max(60),
  description: z.string().min(3).max(200),
  category: AchievementCategory,
  tier: AchievementTier,
  hidden: z.boolean().default(false), // hidden until unlocked
  xp: z.number().int().nonnegative().default(5),
});

export const QuestPeriod = z.enum(['daily', 'weekly']);
export const QuestDef = z.object({
  id: z.string(),
  period: QuestPeriod,
  title: z.string(),
  ruleKind: z.enum(['races_completed', 'races_won', 'wpm_threshold',
                    'accuracy_threshold', 'language_specific',
                    'streak_days', 'tournament_round']),
  target: z.number().int().positive(),
  language: z.string().optional(),
  xp: z.number().int().positive(),
});

export const QuestProgress = z.object({
  userId: z.string(),
  rotationId: z.string(),  // YYYY-MM-DD for daily, ISO-week for weekly
  questId: z.string(),
  progress: z.number().int().nonnegative(),
  target: z.number().int().positive(),
  claimed: z.boolean(),
  claimedAt: z.string().datetime().optional(),
});
```

## Achievement rule engine

Achievements are **predicates over the event stream**. A rule is just:

```ts
type Rule = {
  id: string;
  match: (ev: Event, state: PlayerState) => boolean;
};
type PlayerState = {
  totalRaces: number;
  langsRaced: Set<string>;
  bestWpm: number;
  bestAcc: number;
  // ...lazily populated, fetched from existing profile/history rows on first miss.
};
```

Rules live in `shared/src/progression/rules/` — one file per achievement, exported as `Rule`. The engine loads them at module init.

### Example rules

```ts
// shared/src/progression/rules/perfect_rust.ts
export default {
  id: 'perfect_rust',
  match: (ev, s) =>
    ev.type === 'RACE_FINISHED' &&
    ev.payload.language === 'rust' &&
    ev.payload.accuracy === 1.0,
};

// shared/src/progression/rules/polyglot_5.ts
export default {
  id: 'polyglot_5',
  match: (ev, s) => {
    if (ev.type !== 'RACE_FINISHED') return false;
    s.langsRaced.add(ev.payload.language);
    return s.langsRaced.size >= 5;
  },
};
```

### Engine flow

For each event in the stream batch:

1. Load the user's `PlayerState` (cached for batch lifetime).
2. For each rule, call `match()`. On `true`:
   - `Put UnlockedRow` with `ConditionExpression: attribute_not_exists(SK)`.
   - On success, append an `ACHIEVEMENT_UNLOCKED` event to XP ledger (+5 XP).
   - Send `ACHIEVEMENT_UNLOCKED` toast push over WS to user's connections (if online).
3. Idempotency comes from the conditional put. A retried stream batch is harmless.

### Hot-path constraint

The progression Lambda is *not* in the race-finalization path. Even if the achievement engine is fully broken or stuck, races still complete and rate. The engine is allowed to fall behind by minutes; the SLA is "achievements unlock within 60 s p99", not "at finalization time".

## Quest engine

### Rotation

A daily cron at 00:00 UTC selects 3 daily quests deterministically:

```ts
const seed = sha256(`daily:${YYYY-MM-DD}`);
const picks = pickN(seed, dailyQuestPool, 3);
```

Deterministic so we can re-derive yesterday's quests for late-claim flows. Weekly quest rotates Mondays 00:00 UTC.

### Progress tracking

Each consumed event runs through quest evaluators in parallel with achievement rules. Quest progress writes use `ADD progress :delta` atomic increments with `ConditionExpression: progress < target` to short-circuit completed quests.

### Claim flow

Completing a quest *does not* auto-grant XP. The user sees a "claim" button on the home page. On click:

```
TransactWriteItems:
  Update QuestProgress SET claimed = true, claimedAt = :now (cond: claimed = false AND progress >= target)
  Update XPSummary ADD totalXp :xp
  Put XPLedgerRow EV#<ts>#<questId>  (ev type CLAIM_QUEST)
```

Why a claim step? Reward animation + agency. Auto-claiming makes the XP feel free; tapping makes it earned.

## XP & levels

Curve: `xp(level) = floor(100 * level^1.5)`. Cumulative XP to reach level `L`: `sum_{i=1}^{L-1} xp(i)`.

### Recompute on write

`XPSummary` is updated in the same `TransactWriteItems` that writes the ledger row. `level` is recomputed in-handler:

```ts
function levelFor(totalXp: number): { level: number; currentLevelXp: number; nextLevelXp: number } {
  let level = 1;
  let cum = 0;
  while (level < 60) {
    const need = Math.floor(100 * Math.pow(level, 1.5));
    if (cum + need > totalXp) break;
    cum += need;
    level++;
  }
  return { level, currentLevelXp: totalXp - cum, nextLevelXp: Math.floor(100 * Math.pow(level, 1.5)) };
}
```

Pure function; lives in `shared/src/progression/xp.ts`. Levels are derived, never authoritative — if the curve changes, replay the ledger to re-derive.

## API surface

### HTTP

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/me/xp` | totalXp, level, breakdown |
| `GET` | `/me/achievements` | List with unlocked + locked (locked sans hidden) |
| `GET` | `/users/:userId/achievements` | Public view (hidden filtered) |
| `GET` | `/me/quests` | Active quests + progress |
| `POST` | `/me/quests/:questId/claim` | Claim XP |
| `PUT` | `/me/achievements/pin` | Body: `{ slots: string[6] }` |
| `GET` | `/achievements` | Catalog (cacheable) |

### WS pushes

- `XP_GAINED` — small toast.
- `LEVEL_UP` — celebration animation.
- `ACHIEVEMENT_UNLOCKED` — toast + sound (opt-out in settings).
- `QUEST_COMPLETED` — turns claim button gold.

## Lambda layout

```
lambdas/src/stream/
  progressionBus.ts        # main consumer; demux events to engine + persistence
  firehoseSink.ts          # mirrors envelopes to Kinesis Firehose for S3 archive
lambdas/src/http/progression/
  xp.ts
  achievements.ts
  quests.ts
  claim.ts
  pin.ts
lambdas/src/cron/
  rotateQuests.ts          # 00:00 UTC daily; Monday for weekly
  replayEvents.ts          # admin-only; replays S3 archive for retroactive unlocks
```

## Frontend

### New routes & components

- `/profile` extended: XP bar, level, pinned achievement strip.
- `/achievements` — full catalog, filterable by category/tier, sortable by unlock date.
- `/quests` — daily/weekly cards with progress rings + claim CTAs.
- `<XPToast>` — bottom-right slide-in.
- `<LevelUpModal>` — fires on `LEVEL_UP`; minimal, dismissable.
- `<AchievementToast>` — top-right; respects user "reduce motion" pref.
- `<QuestCard>` — progress ring + claim button (gold when complete).

### XState additions

`progressionActor` — global, owned by `app` machine. Subscribes to a dedicated WS channel. Buffers toasts so a level-up + 3 achievement unlocks at once don't spam — collapse into a single multi-stack toast.

```
states: idle → listening
events: XP_GAINED, LEVEL_UP, ACHIEVEMENT_UNLOCKED, QUEST_COMPLETED, DISMISS
context: { queue: Toast[], levelUpPending: bool }
```

## Acceptance criteria

- [ ] Finishing a race emits exactly one `XPLedgerRow` and at most one `XPSummary` update per user (verified by stream-replay test).
- [ ] Re-running the achievement engine over the same event batch produces zero duplicate `UnlockedRow`s (idempotency).
- [ ] All 40 launch achievements have a `Rule`, a Zod-valid `AchievementDef`, and an icon.
- [ ] Daily quest rotation is deterministic across regions and reruns (golden test on `pickN(seed, …)`).
- [ ] Claim is rejected with 409 if `progress < target` or `claimed = true`.
- [ ] `XPSummary.level` and `levelFor(totalXp).level` agree for 1000 randomized totalXp values.
- [ ] Admin `replayEvents` against a 24-hour S3 partition completes in <10 min for 100k events on a single Lambda invocation (≤900 s).
- [ ] All new endpoints return Zod-validated bodies; all WS pushes have versioned payloads (`v: 1`).
- [ ] CloudWatch alarm: `progression-bus iterator-age > 60s for 5 min`.

## Test plan

### Unit

- `xp.ts` — level monotonicity, cap at 60.
- Each rule file has a `*.test.ts` with one positive and one negative event.
- `quests/rotation.ts` — same seed → same picks; pool exhaustion fallback.
- `quests/claim.ts` — concurrent claim race (only one wins).

### Integration

- Stream batch with 50 mixed events → exactly the right unlocks and quest progress in a clean DDB.
- Replay yesterday's S3 partition into a fresh DDB → state converges to live DDB (assuming no admin intervention).

### E2E

- New user, races to level 5, unlocks 3 achievements, claims a quest. All toasts visible in order.

### Property-based

- For 1000 random event sequences, achievement engine is *idempotent* (same final state on re-run) and *commutative for unlocks* (ordering doesn't change which achievements unlock, only their `unlockedAt`).

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| Stream Lambda iterator-age spikes blocking unlocks | Reserved concurrency = 5; alarmed; fallback path: catch-up replay job from S3 archive. |
| Rule file regression unlocks for everyone | Each rule has a deploy-time golden fixture. CI fails if a rule's fixture changes without a `breaking_change` migration note. |
| Hot partition on `ACH#<commonAchievement>` for "first race" | Achievements with >50% expected unlock-rate are excluded from `GSI1PK = ACH#...` lookups (mark `unlisted: true` in def). |
| User XP race condition (two parallel ledger writes) | `XPSummary` write uses `UpdateExpression: ADD totalXp :delta` atomic + recompute level inside handler with optimistic CAS on `version`. |
| Quest claim while quest rotates at midnight | Rotation only adds new active rows; old rows stay until 7-day TTL. Old quests can be claimed for 24 h after rotation. |

## Migration / rollout

1. Add event envelope wrappers and Firehose archive *first* (zero behavior change). Verify event flow for a week.
2. Ship XP-only (no achievements/quests). Observe stream Lambda metrics under load.
3. Ship 10 starter achievements. Observe duplicate-unlock metrics.
4. Ship quests + claim flow.
5. Add remaining 30 achievements in a follow-up PR.

## Rollback

- `ENABLE_PROGRESSION` flag gates all new endpoints (returns 503).
- Stream Lambda can be detached from DDB Streams in seconds; gameplay path is unaffected.
- All new tables are key-prefixed; data left in DDB is inert.

## Estimate

10 dev-days. ~2 d event log + Firehose, 2 d achievement engine + 10 launch rules, 2 d quest engine + rotation, 2 d frontend (toasts, profile, /achievements, /quests), 1 d remaining 30 achievements, 1 d Playwright + property tests.
