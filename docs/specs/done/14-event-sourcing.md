# Phase 14 — Event Sourcing for Races

## Goal

Replace the current "current-state-only" persistence of race progress with an **append-only event log** that is the source of truth for everything race-related. Replays, anti-cheat heuristics, and Phase 11 progression all become **projections** of the same log.

Specifically:

- Every keystroke-batch, finish, and lifecycle transition becomes an immutable `RaceEvent` row in DDB.
- Current race state is a **derived projection**, rebuildable at any time by re-reducing events.
- Replays (Phase 07) stop being a separate JSON blob and become a function over the log.
- A **transactional outbox** guarantees that domain events make it to side-effect consumers (broadcast, progression) exactly once-effectively.

## Motivation

- Today's race state is stored as the latest snapshot per player. If a bug corrupts state, the game is unrecoverable. With events, we can rebuild any race at any wall-clock time.
- Phase 11 already streams race events into S3 for retroactive achievement unlocks. Making events the **primary** write makes that path first-class instead of a side-effect.
- Anti-cheat heuristics today inspect a synthesized "history" of cursor positions; with an event log, they read the actual events the user produced — higher fidelity and lower false-positive rate.
- The **outbox pattern** removes a long-standing risk: today, a race finalization writes to DDB *and* publishes to broadcast/stream consumers. If the publish fails, state diverges. With an outbox, the publish is itself a DB write inside the same transaction.

## Scope

### In

- New entity: `RaceEvent` rows, append-only, partitioned by race.
- New entity: `RaceProjection` rows, eventually consistent snapshots.
- Reducer (`reduce(events) → state`) lives in `@codetype/domain` and is the single source of game logic.
- Replay viewer reads from `RaceEvent` rows, no longer S3.
- Transactional outbox: `OutboxEntry` rows written in the same transaction as command results, drained by a stream-driven publisher.
- Idempotent commands: every mutating command requires a `commandId` (UUID). Re-issuing the same id is a no-op.
- Online migration of in-flight races (next paragraph).

### Out

- Event sourcing for **non-race** entities (rooms, profiles, ratings) — kept as snapshot-CRUD.
- CQRS read replicas in a separate datastore (Aurora, OpenSearch). All projections stay in DDB.
- Time-travel debugging UI for staff. Replay viewer is enough.
- Migration of historical S3 replays into the new event store. Pre-migration replays continue to be served from S3 unchanged (URL versioning).

## Event model

### Event types

```ts
// domain/src/events/RaceEvent.ts
export const RaceEventType = z.enum([
  'RACE_CREATED',
  'PLAYER_JOINED',
  'PLAYER_LEFT',
  'COUNTDOWN_STARTED',
  'RACE_STARTED',
  'CURSOR_PROGRESS',     // batched 20 Hz keystroke deltas
  'PLAYER_FINISHED',
  'RACE_FINISHED',
  'RACE_CANCELLED',
  'PLAYER_FLAGGED',      // anti-cheat
]);

export const RaceEvent = z.object({
  raceId: z.string().uuid(),
  seq: z.number().int().nonnegative(),     // monotonic per race, 0..N
  type: RaceEventType,
  occurredAt: z.string().datetime(),
  actorId: z.string().nullable(),          // player or 'system'
  payload: z.record(z.unknown()),
  commandId: z.string().uuid().nullable(),  // for idempotency
  causationId: z.string().uuid().nullable(),
  correlationId: z.string().uuid(),
});
```

### Persistence

| Field | Type | Note |
|---|---|---|
| PK | `RACE#<raceId>` | partition |
| SK | `EV#<10-digit-seq>` | sort key, dense seq |
| ... | RaceEvent fields | |
| GSI1PK | `EV#TYPE#<type>` | rare: cross-race scans for analytics |
| GSI1SK | `<occurredAt>` | |

Events are **never updated** after write. The only mutation is the `seq` next-allocator (see below).

### Seq allocator

Per race, sequence numbers must be dense and gap-free for replay to be deterministic. Approach:

- Per-race `Counter` row: `PK = RACE#<id>`, `SK = COUNTER`, attribute `nextSeq`.
- Within a `TransactWriteItems`, the writer:
  - `Update Counter SET nextSeq = nextSeq + 1, RETURN_VALUES UPDATED_NEW` *(read-after-write)*
  - actually: pre-increment via `Update`, then read it back from the returned value, then issue a *separate* `TransactWriteItems` putting the event at that seq.
- This is a 2-call write — one increment + one transact-put. Cost: ~+30 ms p50 vs single-write today.

For high-frequency `CURSOR_PROGRESS` events we **do not** use the per-event seq path. Instead, the existing 20 Hz `cursorThrottleActor` already coalesces keystrokes; the server-side cursor flush handler writes one `CURSOR_PROGRESS` event per (player, 50 ms window), already amortised.

Cost example: 4-player race, 30 s long, 50 ms windows = 4 × 600 = 2400 cursor events per race. At ~100 bytes/event, ~240 KB. Acceptable.

### Compaction

After a race ends, cursor events are compacted offline:

- `RACE#FINISHED` stream record triggers a `compactRace` Lambda.
- It reads all `CURSOR_PROGRESS` events for the race, downsamples to 5 Hz, writes a `CURSOR_DIGEST` event, deletes original cursor events older than 24 h.
- The replay viewer prefers `CURSOR_DIGEST` if present, falls back to raw events for races <24 h old.

This caps long-term storage at ~50 KB/race typical.

## Projections

A **projection** is a function `(events) → readModel` plus a persistence row.

### `RaceProjection`

The "current snapshot" the room view reads. Updated by the projection Lambda after each event batch:

| Field | Type |
|---|---|
| PK | `RACE#<id>` |
| SK | `PROJ#STATE` |
| status | RaceStatus |
| players | { userId, charsTyped, accuracy, finishedAt? }[] |
| lastSeq | number |
| updatedAt | datetime |

When a client opens `/room/<id>`:

1. Read `PROJ#STATE` (eventual; usually <100 ms behind the log).
2. Subscribe to WS for live events from `lastSeq + 1`.

Reconnects use the same handshake — client sends `lastSeq`, server sends only events after it.

### `LeaderboardProjection` (revisits Phase 13)

Same pattern. Source events: `RACE_FINISHED`. Reducer applies Elo delta and updates per-language top-100.

## Transactional outbox

Every command's `TransactWriteItems` includes:

- The event(s) being appended.
- The projection update(s).
- An `OutboxEntry` row: `PK = OUTBOX`, `SK = <ulid>`, `payload = { eventId, type, channel: 'broadcast'|'progression'|'analytics' }`.

A small **outbox-publisher Lambda** is the *only* consumer of `PK = OUTBOX` items via DDB Streams:

- For each entry, dispatch to the right channel (API Gateway broadcast, EventBridge bus, etc.).
- After successful dispatch, delete the outbox row.
- Failures: backoff up to 6 attempts, then dead-letter to `OUTBOX_DLQ` partition.

This guarantees: if the command's transaction commits, side effects *will* fire. If it doesn't commit, side effects *cannot* fire. No more "DB updated but broadcast dropped".

## Anti-cheat over events

Anti-cheat heuristics in Phase 07 are reframed as **a projection**:

- `AntiCheatProjection` consumes `CURSOR_PROGRESS` and `PLAYER_FINISHED` events.
- Maintains rolling stats per (raceId, playerId): inter-keystroke variance, paste-shape detection, finish-time vs typing-rate divergence.
- Emits `PLAYER_FLAGGED` events back into the log when a heuristic trips. The flag is itself an event — fully auditable.

Mods reviewing flags see the actual events that caused the flag, not a synthesized summary.

## Idempotency

Every mutating command requires a `commandId` UUID, supplied by the client (XState generates one per command on `INTENT`).

Persistence:

- `IdempotencyRow`: `PK = IDEM#<userId>`, `SK = CMD#<commandId>`, `result`, TTL 1 h.
- The first writer puts this row inside the same transaction as the event(s).
- A retry sees `ConditionExpression: attribute_not_exists(SK)` fail, reads the row, returns its cached `result`.

This makes commands safe to retry over flaky WS connections.

## API & WS shape

### Read

- `GET /races/:id` — returns `RaceProjection`.
- `GET /races/:id/events?since=<seq>` — returns events after `seq` (paginated, max 1000).
- `GET /races/:id/replay` — convenience: returns a downsampled event stream for the replay viewer.

### Write

All mutating endpoints accept a `Idempotency-Key: <uuid>` header (mapped to `commandId`).

### WS

- `EVENT_APPEND` server→client: payload is one or more `RaceEvent`s in seq order.
- Client maintains `lastSeq`; on gap, requests `/races/:id/events?since=lastSeq` to backfill.

## Reducer

```ts
// domain/src/services/RaceReducer.ts
export function reduce(state: RaceState | undefined, ev: RaceEvent): RaceState {
  state ??= initialRaceState();
  switch (ev.type) {
    case 'RACE_CREATED':       return { ...state, id: ev.raceId, status: 'lobby' };
    case 'PLAYER_JOINED':      return { ...state, players: addPlayer(state.players, ev.payload.userId) };
    case 'COUNTDOWN_STARTED':  return { ...state, status: 'countdown', countdownStartedAt: ev.occurredAt };
    case 'RACE_STARTED':       return { ...state, status: 'racing', startedAt: ev.occurredAt };
    case 'CURSOR_PROGRESS':    return { ...state, players: applyProgress(state.players, ev.payload) };
    case 'PLAYER_FINISHED':    return { ...state, players: markFinished(state.players, ev.actorId!, ev.payload) };
    case 'RACE_FINISHED':      return { ...state, status: 'finished', finishedAt: ev.occurredAt };
    case 'RACE_CANCELLED':     return { ...state, status: 'cancelled' };
    case 'PLAYER_FLAGGED':     return { ...state, players: flag(state.players, ev.actorId!, ev.payload.reason) };
  }
  return state;
}
```

`reduce` is pure, lives in `@codetype/domain`, and is the **same function** used:

- Server-side projection Lambda.
- Client-side replay viewer.
- Tests.

A property test asserts: for any seed event sequence, `reduce` is **commutative-up-to-seq-order** for non-overlapping player events (cursor events of player A and B can be reordered without changing the final state). This is the formal correctness check that lets us run projection workers in parallel.

## Migration: in-flight races during deploy

The deploy can flip mid-race. Strategy:

1. **Phase A (1 week, dual-write):** every existing snapshot write also appends an event. Reads still come from snapshot. No behavior change.
2. **Phase B (1 day, dual-read shadow):** projection Lambda reads events and rebuilds projection; a comparator Lambda checks projection vs legacy snapshot every minute, alarms on divergence.
3. **Phase C (cutover):** flip read path to projection. Snapshot writes can be removed in a follow-up PR.

In-flight races at cutover: each room's `RoomMachine` triggers a "resync" on receiving the first `EVENT_APPEND` with seq mismatch. Worst case the user sees a 200 ms stutter and the race continues from current state.

## Schema additions

```
@codetype/shared/schemas/events.ts        # RaceEvent + RaceEventType
@codetype/shared/schemas/idempotency.ts   # Idempotency-Key header + result envelope
shared/src/ddb-keys.ts                    # raceEventKey, projKey, outboxKey, idempKey
```

## Lambda layout

```
lambdas/src/stream/
  raceProjection.ts          # consumes RaceEvent stream → updates RaceProjection
  outboxPublisher.ts         # consumes OutboxEntry stream → publishes side effects
  compactRace.ts             # post-finish cursor compaction
  antiCheatProjection.ts     # consumes events → emits PLAYER_FLAGGED
lambdas/src/http/races/
  get.ts                     # reads RaceProjection
  events.ts                  # paginated event listing
  replay.ts                  # downsampled event stream
```

The HTTP / WS handlers call `commandBus.dispatch('FinishRace', { ... commandId })`. The bus middleware:

- Reads/writes `IdempotencyRow`.
- Wraps work in a `UnitOfWork` (Phase 13 concept) which collects: events to append, projection mutations, outbox entries.
- Flushes via one `TransactWriteItems`.

## Acceptance criteria

- [ ] All race lifecycle transitions persist as `RaceEvent` rows; legacy snapshot writes are removed (post-cutover).
- [ ] Reducer is pure (CI grep gate: no imports from `@aws-sdk` in `domain/src/services/RaceReducer.ts`).
- [ ] Reducer property test passes: 1000 random orderings of non-overlapping player events converge to the same final state.
- [ ] Replay of a 30-second 4-player race from events reproduces the original podium (golden test fixture).
- [ ] Idempotent retry: posting the same `Idempotency-Key` returns the original result with a cache-hit header (`X-Idempotent-Replay: true`).
- [ ] Outbox publisher dispatches each entry exactly once during normal operation; ≤ 0.01% duplicates under simulated retry storms (test).
- [ ] Comparator Lambda reports zero divergence between snapshot and projection over a 24-hour shadow period before cutover.
- [ ] Anti-cheat heuristic fires identically against the new event log as it did against the synthetic history (Phase 07 fixtures pass).
- [ ] Cursor-event compaction reduces 4-player 30 s race storage from ~250 KB to ≤ 50 KB.
- [ ] CloudWatch alarm: `OUTBOX_DLQ` count > 0.

## Test plan

### Unit (pure)

- Reducer per event type — explicit fixtures.
- Reducer commutativity property — 1000 random orderings.
- Idempotency: re-dispatch returns cached result.
- Outbox: serialization round-trip.

### Integration (DDB local)

- Append-then-read seq numbers are dense and gap-free under 100 concurrent writers per race.
- Outbox draining: kill the publisher mid-batch, restart, no message lost or duplicated beyond at-most-once dispatcher idempotency.
- Comparator: inject a deliberate divergence, verify alarm.

### E2E

- 4-player race, deliberately cause one client to drop WS mid-race, reconnect — final state matches all other clients.
- Replay viewer: scrub timeline, check at every 1 s mark the projection matches an independently-computed reduce of events up to that timestamp.

### Load

- Synthetic 100 concurrent races for 5 minutes; observe projection lag p99 ≤ 500 ms.

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| Seq allocator bottleneck per race | Per-race counter; max 4–8 writers per race so contention is low. Hot races (tournaments) tolerate ~20 events/s. |
| Cost regression from event volume | Cursor compaction caps long-term storage; alarmed on DDB write units. |
| Projection lag during stream-Lambda outage | Reads can fall back to "compute on demand" mode: projection handler exposes `?fresh=true` that re-reduces events on the spot (slow path). |
| Reducer change requires rebuild for in-flight races | Reducer changes are backward-compatible by construction (events are immutable). For breaking reducer changes, replay creates a versioned projection alongside the old one. |
| Outbox publisher hot loop | Backoff + DLQ + alarm. Dispatcher idempotent at consumer side. |
| Player drops, reconnects, sees old state briefly | Projection eventually converges; client uses seq-based catch-up so any gap is ≤ 1 round-trip. |

## Migration / rollout

Sequential and reversible:

1. Land event schema, key generators, reducer (no behaviour change).
2. Land outbox + comparator Lambdas behind dual-write flag.
3. Run dual-write in prod for 7 days, comparing snapshots vs projections.
4. Cut reads to projection.
5. Stop dual-write to snapshot.
6. Move replay viewer to event store (deprecate S3 replay path with redirect for older replays).

## Rollback

- Each phase has a flag; revert turns it off.
- Events written are append-only and harmless to leave in DDB.
- Snapshot writes remain enabled until step 5; rolling back to snapshot reads is one config flip.

## Estimate

15 dev-days. ~3 d schema + reducer + tests, 2 d projection Lambda, 2 d outbox + idempotency, 2 d anti-cheat projection, 2 d compaction + replay, 2 d shadow comparison + cutover, 2 d load testing + monitoring.
