# Phase 13 — Hexagonal Architecture & CQRS-lite Refactor

## Goal

Restructure the backend so that **business rules are independent of AWS, of DynamoDB, and of HTTP/WS framing**. Achieve this by extracting a pure `@codetype/domain` package, introducing **ports** (interfaces) for every external dependency, and splitting handlers into **commands** (mutations) and **queries** (reads) with separate pipelines.

This is a refactor — no observable feature changes — but it is the prerequisite for fast iteration on Phase 09–12 features and for the event-sourced flows already started in Phase 11.

## Motivation

- `lambdas/src/repos/*` is currently a thin layer that exposes DDB-shaped methods (`putRoom`, `queryRatingByLang`). Domain logic (e.g. "can this user join this room?") leaks into HTTP handlers, which makes both unit testing and rule changes painful.
- HTTP handlers do *both* read and write work in the same path. Reads are p99 ~80 ms (DDB round-trip), writes are p99 ~250 ms (transactional). They have very different tuning needs (concurrency, caching, retry).
- Adding new persistence (e.g. S3 replays in Phase 07) requires touching every layer because the dependency direction is wrong: handlers depend on AWS, not on abstractions.
- Hexagonal (ports & adapters) inverts that: handlers depend on a `RoomService` interface; the AWS-backed `DdbRoomRepo` adapter is wired in at the edge.

## Scope

### In

- New workspace: `@codetype/domain`. Pure TS, zero AWS deps. Contains entities, value objects, domain services, and **ports** (interfaces).
- New workspace: `@codetype/adapters-aws`. Implements ports against DDB / S3 / API Gateway Management API. Depends on `@aws-sdk/*`.
- New workspace: `@codetype/app`. Use-case layer. Imports `@codetype/domain` ports; orchestrates one command/query per file.
- `lambdas/` becomes the **edge layer**: parses input, dispatches to a use-case, formats output. No domain logic.
- Read/write split:
  - All mutations go through a command bus (`commandBus.dispatch(cmd)`).
  - All reads go through a query bus (`queryBus.execute(q)`).
  - Buses are *not* networked — they are in-process dispatchers — but they enable per-pipeline middleware (telemetry, validation, retry).
- Dependency injection via a tiny `Container` (no framework — a 30-line factory map).

### Out

- Microservice split (still one Lambda per handler, single repo, single deployment).
- Event sourcing as the *primary* write model (that's Phase 14).
- gRPC, GraphQL, or any new transport.
- Full DDD aggregates with version vectors. We use lightweight aggregates with optimistic concurrency only where needed.
- Async messaging buses (SQS/EventBridge) — kept exactly as-is.

## Layered architecture

```
┌─────────────────────────────────────────────────────────┐
│ Edge (lambdas/src/{http,ws,stream,cron}/*)              │  ← APIGW, DDB Streams, EventBridge
│  parse → validate → dispatch → format → emit            │
├─────────────────────────────────────────────────────────┤
│ App  (@codetype/app)                                    │  ← Use-cases (commands & queries)
│   commands/CreateRoom, FinishRace, RegisterForTournament│
│   queries/GetRoom, GetLeaderboard                       │
├─────────────────────────────────────────────────────────┤
│ Domain (@codetype/domain)                               │  ← Entities, value objects, services
│   Room, Race, Player, Elo, Snippet                      │
│   ports/{RoomRepo, RaceRepo, RatingRepo, Clock, Random} │
├─────────────────────────────────────────────────────────┤
│ Adapters (@codetype/adapters-aws)                       │  ← Concrete I/O
│   DdbRoomRepo, S3ReplayStore, APIGWBroadcaster, ...     │
└─────────────────────────────────────────────────────────┘
```

**Dependency rule:** arrows point downward only. Domain knows nothing about App; App knows nothing about Edge or Adapters.

## Workspaces & files

### `@codetype/domain`

```
domain/
  package.json                    # type: module, no deps
  src/
    entities/
      Room.ts                     # entity with invariants (size 2..8, hostId in players, ...)
      Race.ts                     # entity, status state machine
      Player.ts
      Snippet.ts
    valueObjects/
      RoomId.ts, JoinCode.ts, Wpm.ts, Accuracy.ts, EloRating.ts
    services/
      RoomService.ts              # canJoin(), addPlayer(), startCountdown()
      EloService.ts               # delta(), apply()
      AntiCheatService.ts         # flag() — pure
    ports/
      RoomRepo.ts                 # interface
      RaceRepo.ts
      RatingRepo.ts
      SnippetRepo.ts
      ReplayStore.ts
      Broadcaster.ts              # postToConnection(connId, msg)
      Clock.ts                    # now(): Date — testable
      Random.ts                   # uuid(), pickN() — testable
      EventPublisher.ts
    errors.ts                     # DomainError hierarchy
  tests/
    entities/Room.test.ts         # pure tests, no I/O
    services/EloService.test.ts
```

#### Example: `Room` entity (sketch)

```ts
// domain/src/entities/Room.ts
import { JoinCode, RoomId } from '../valueObjects';
import { DomainError } from '../errors';

export type RoomStatus = 'lobby' | 'countdown' | 'racing' | 'finished';

export class Room {
  private constructor(
    readonly id: RoomId,
    readonly joinCode: JoinCode,
    readonly hostId: string,
    private _status: RoomStatus,
    private _players: string[],
    readonly snippetId: string,
    readonly createdAt: Date,
  ) {}

  static create(args: { hostId: string; snippetId: string; joinCode: JoinCode; clock: Clock; random: Random }): Room {
    return new Room(
      RoomId.from(args.random.uuid()),
      args.joinCode,
      args.hostId,
      'lobby',
      [args.hostId],
      args.snippetId,
      args.clock.now(),
    );
  }

  addPlayer(userId: string): void {
    if (this._status !== 'lobby') throw new DomainError('room.not_lobby', 409);
    if (this._players.includes(userId)) return; // idempotent
    if (this._players.length >= 8) throw new DomainError('room.full', 409);
    this._players.push(userId);
  }

  startCountdown(by: string, clock: Clock): void {
    if (by !== this.hostId) throw new DomainError('room.not_host', 403);
    if (this._players.length < 2) throw new DomainError('room.too_few', 409);
    this._status = 'countdown';
  }

  // ...etc

  get players(): readonly string[] { return this._players; }
  get status(): RoomStatus { return this._status; }
  toSnapshot() { /* plain object for repo persistence */ }
  static fromSnapshot(s: Snapshot): Room { /* rehydrate */ }
}
```

The entity has **no DDB awareness**, **no Zod**, and **no clock dependency** beyond what's passed in. This is what enables exhaustive unit tests and makes future event-sourced reconstruction trivial.

### `@codetype/app`

```
app/
  package.json                    # depends on @codetype/domain only
  src/
    commands/
      CreateRoom.ts               # { execute(input, ports): Promise<RoomId> }
      JoinRoom.ts
      StartCountdown.ts
      FinishRace.ts
      RegisterForTournament.ts
      ClaimQuest.ts
    queries/
      GetRoom.ts
      GetLeaderboard.ts
      GetProfile.ts
    bus/
      CommandBus.ts               # dispatch<C extends Command>(c: C): Promise<C['result']>
      QueryBus.ts
      Middleware.ts               # validation, telemetry, retry, transaction
    container.ts                  # wires ports → adapters
  tests/
    commands/CreateRoom.test.ts   # uses InMemoryRoomRepo
    queries/GetLeaderboard.test.ts
```

#### Example: command handler

```ts
// app/src/commands/CreateRoom.ts
import type { RoomRepo, SnippetRepo, Clock, Random } from '@codetype/domain/ports';
import { Room, JoinCode } from '@codetype/domain';

export type CreateRoomInput = { hostId: string; snippetId: string };
export type CreateRoomResult = { roomId: string; joinCode: string };

export class CreateRoom {
  constructor(
    private rooms: RoomRepo,
    private snippets: SnippetRepo,
    private clock: Clock,
    private random: Random,
  ) {}

  async execute(input: CreateRoomInput): Promise<CreateRoomResult> {
    const snippet = await this.snippets.get(input.snippetId);
    if (!snippet) throw new DomainError('snippet.not_found', 404);
    const room = Room.create({
      hostId: input.hostId,
      snippetId: input.snippetId,
      joinCode: JoinCode.random(this.random),
      clock: this.clock,
      random: this.random,
    });
    await this.rooms.save(room);
    return { roomId: room.id.value, joinCode: room.joinCode.value };
  }
}
```

#### Command bus

```ts
// app/src/bus/CommandBus.ts
export interface CommandHandler<I, O> { execute(input: I): Promise<O>; }
export class CommandBus {
  private handlers = new Map<string, CommandHandler<unknown, unknown>>();
  private middleware: Middleware[] = [];

  register<I, O>(name: string, h: CommandHandler<I, O>) { /* ... */ }
  use(mw: Middleware) { this.middleware.push(mw); }

  async dispatch<O>(name: string, input: unknown): Promise<O> {
    const chain = compose(this.middleware);
    return chain(name, input, async (n, i) => {
      const h = this.handlers.get(n);
      if (!h) throw new Error(`No handler: ${n}`);
      return h.execute(i);
    });
  }
}
```

### `@codetype/adapters-aws`

```
adapters-aws/
  package.json                    # depends on @aws-sdk/* and @codetype/domain
  src/
    DdbRoomRepo.ts                # implements RoomRepo via @codetype/domain/ports/RoomRepo
    DdbRaceRepo.ts
    DdbRatingRepo.ts
    S3ReplayStore.ts
    APIGWBroadcaster.ts
    SystemClock.ts
    CryptoRandom.ts
    EventBridgePublisher.ts
  tests/                          # use DDB local + minimal AWS mocks
```

Adapters convert between the **domain shape** and the **persistence shape**. They are the *only* place that knows about `PK`/`SK` keys.

### `lambdas/`

Edge layer becomes very thin:

```ts
// lambdas/src/http/rooms/create.ts
import { withHttp } from '../../middleware';
import { CreateRoomInput } from '@codetype/shared/schemas/rooms';
import { container } from './_container';

export const handler = withHttp({
  schema: CreateRoomInput,
  authRequired: true,
}, async (input, ctx) => {
  const result = await container.commandBus.dispatch('CreateRoom', {
    hostId: ctx.userId,
    snippetId: input.snippetId,
  });
  return { status: 201, body: result };
});
```

### `_container.ts`

A per-Lambda module that wires ports → adapters:

```ts
import { CommandBus, QueryBus } from '@codetype/app';
import { DdbRoomRepo, S3ReplayStore, APIGWBroadcaster, SystemClock, CryptoRandom } from '@codetype/adapters-aws';
import { CreateRoom, JoinRoom, FinishRace, GetRoom, GetLeaderboard } from '@codetype/app';

const clock = new SystemClock();
const random = new CryptoRandom();
const rooms = new DdbRoomRepo({ table: process.env.TABLE!, ddb });
const races = new DdbRaceRepo({ table: process.env.TABLE!, ddb });
const replays = new S3ReplayStore({ bucket: process.env.REPLAY_BUCKET! });
const broadcaster = new APIGWBroadcaster({ endpoint: process.env.WS_ENDPOINT! });

export const commandBus = new CommandBus()
  .use(zodValidationMiddleware)
  .use(telemetryMiddleware)
  .use(transactionMiddleware);
commandBus.register('CreateRoom', new CreateRoom(rooms, snippets, clock, random));
commandBus.register('JoinRoom',   new JoinRoom(rooms, clock));
commandBus.register('FinishRace', new FinishRace(races, ratings, replays, clock));

export const queryBus = new QueryBus().use(telemetryMiddleware);
queryBus.register('GetRoom',        new GetRoom(rooms));
queryBus.register('GetLeaderboard', new GetLeaderboard(ratings));

export const container = { commandBus, queryBus };
```

Module-scoped — initialised once per cold start, kept warm across invocations. Cold-start budget impact: <30 ms (mostly the SDK clients, which already exist).

## CQRS-lite

The split is **process-internal**, not networked.

| Aspect | Commands | Queries |
|---|---|---|
| Output | side-effects + small ack payload | data |
| Concurrency | low (mutations) | high |
| Retry | idempotent w/ command id | safe to retry |
| Caching | invalidate-on-write | CloudFront / Lambda cache OK |
| Telemetry | full event trace | timing only |
| DB consistency | strong (Transact when needed) | eventually consistent reads OK |
| Backpressure | reject early on unhealthy adapter | shed load via 503 |

### Read replicas / projections

Some queries are read-optimised projections built by stream consumers. Examples:

- `LeaderboardProjection` — denormalised top-100 per language; rebuilt by the ratings stream consumer.
- `RoomSummaryProjection` — used by `GET /rooms/:id` to avoid two queries per request.

This is where the architecture meets Phase 14 event sourcing cleanly.

### Middleware

A small middleware chain runs around every dispatch:

```ts
type Middleware = (name: string, input: unknown, next: (n: string, i: unknown) => Promise<unknown>) => Promise<unknown>;

export const zodValidationMiddleware: Middleware = async (n, i, next) => {
  const schema = schemaRegistry[n];
  if (schema) i = schema.parse(i);
  return next(n, i);
};

export const telemetryMiddleware: Middleware = async (n, i, next) => {
  const span = startSpan(`bus:${n}`);
  try { return await next(n, i); }
  catch (e) { span.recordException(e); throw e; }
  finally { span.end(); }
};

export const transactionMiddleware: Middleware = async (n, i, next) => {
  // open a unit-of-work for transactional commands
  return UnitOfWork.run(() => next(n, i));
};
```

### Unit of Work

Some commands need atomic multi-row writes. `UnitOfWork.run(fn)` collects all repo writes into a buffer; at the end, flushes them as a single `TransactWriteItems`. Repo adapters check `UnitOfWork.current()` and either enqueue or write-through.

## Migration plan (incremental, never break main)

1. **Step 1** — Create the three new workspaces with placeholder modules and tests; wire them into Bun workspaces, CI, and CDK bundling. No handler changes.
2. **Step 2** — Move `wpm.ts`, `streak.ts`, `elo.ts`, `anticheat.ts` into `@codetype/domain/services` (they're already pure). Re-export shims from `@codetype/shared` to avoid breaking any consumer.
3. **Step 3** — Pick one handler per category (e.g. `CreateRoom`, `GetRoom`) and refactor through the bus. Verify behavior end-to-end.
4. **Step 4** — Refactor the remaining mutating handlers (room/race/profile/tournament/etc.). Each handler becomes a 5–15 line edge wrapper.
5. **Step 5** — Refactor read handlers and add a `LeaderboardProjection` to demonstrate the projection pattern.
6. **Step 6** — Delete redundant `lambdas/src/repos/*` files; their replacements live in `@codetype/adapters-aws`.

Estimated calendar: 2 weeks of part-time work alongside other PRs. Each step is a separate PR, mergeable in any order beyond step 1.

## Acceptance criteria

- [ ] `@codetype/domain` has zero `@aws-sdk/*` or `aws-cdk-lib` imports (CI grep gate).
- [ ] `@codetype/app` has zero `@aws-sdk/*` imports.
- [ ] All HTTP handlers under `lambdas/src/http/` are ≤ 30 lines and contain no DDB calls (CI grep gate on `DynamoDBClient`).
- [ ] Every command handler has a unit test using in-memory adapters; no test in `app/tests/` uses real AWS SDK.
- [ ] `bun test` runs domain + app tests in <2 s on a clean machine (pure TS, no I/O).
- [ ] CDK bundle sizes per Lambda do not regress more than 10% (esbuild can tree-shake unused adapters in any single function).
- [ ] All existing E2E tests pass unchanged.
- [ ] One projection (`LeaderboardProjection`) is in production with documented rebuild procedure.
- [ ] Cold-start p99 of a representative HTTP handler ≤ 350 ms (currently ~280 ms; budget +70 ms for the new layer wiring).

## Test plan

### Unit (pure)

- `Room` entity — invariants for join, start, finish.
- `EloService.delta` — symmetric, bounded, monotonic in win.
- `AntiCheatService` — every heuristic isolated.
- Each command handler with `InMemory*Repo`.

### Integration

- DDB-local for adapter tests: `DdbRoomRepo` round-trips a `Room` entity (save → load → equal snapshot).
- `UnitOfWork` flushing 25-item TransactWriteItems with one item that fails the conditional check; expect rollback.

### Contract

- Adapter conformance tests: every `RoomRepo` implementation (in-memory + DDB) must pass the same suite. This guarantees swap-ability.

### E2E

- Existing Playwright suite must pass, since externally observable behavior is unchanged.

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| Refactor introduces silent behavior drift | Step 3 ships only one handler at a time, gated by request shadow-comparison in CI for one week. |
| Cold-start regression | Container lazy-imports adapters per command name, so handlers only initialise the adapters they need. |
| Bus becomes a god-object | Hard cap: bus has only `register/use/dispatch`. No discovery, no retries, no scheduling — those live as middleware or domain code. |
| Developer ergonomics drop (more files per feature) | Code generator: `bun scripts/new-command.ts CreateRoom` scaffolds entity / port / adapter / command / handler / tests in one go. |
| TransactWriteItems failures harder to debug across the abstraction | UnitOfWork attaches a debug summary (`[Put rooms#abc] [Update ratings#xyz]`) to thrown errors. |

## Rollback

- Each step ships behind no flag (it's pure refactor) but is independently revertable.
- If the new wiring proves unstable in a single handler, revert that handler's edge file to its pre-refactor commit; the old `repos/*` shim is kept for 30 days.
- No data shape changes, so no DDB rollback needed.

## Estimate

12 dev-days spread over 2–3 weeks (incremental). Roughly: 2 d scaffolding & CI, 1 d move pure modules, 5 d migrate handlers, 2 d projection + UoW, 2 d tests + perf verification.
