# Phase 03 — Backend Refactors

## Goal

Replace ad-hoc Lambda boilerplate with three layers:
1. **Zod schemas** in `@codetype/shared/schemas` — single source of truth for HTTP/WS payloads.
2. **Middleware** wrapping every handler with parsing, validation, error mapping, structured logging.
3. **Repositories** encapsulating DynamoDB access patterns.

Handlers shrink to business logic only.

## Motivation

- 11 handlers each repeat: parse event → validate → call DDB → format response → catch errors. Inconsistent error shapes are inevitable.
- Tests are awkward because handlers couple HTTP concerns with data access.
- Without shared schemas, frontend types and backend validation drift.

## Scope

### In
- Add Zod to `@codetype/shared`.
- Author schemas for every HTTP request/response and every WS message.
- `lambdas/src/middleware.ts` — `withHttp` and `withWs` wrappers.
- `lambdas/src/AppError.ts` — typed application errors.
- `lambdas/src/repos/` — `RoomRepo`, `UserRepo`, `HistoryRepo`, `ConnectionRepo`, `SnippetRepo`.
- Migrate all 11 handlers (`http/*`, `ws/*`, `stream/broadcast.ts`).
- Replace hand-written types in `shared/src/types.ts` with `z.infer<>` exports.

### Out
- No new endpoints.
- No DDB schema changes.
- No frontend changes (frontend will adopt schemas in Phase 04).

## File changes

### New: `shared/src/schemas.ts`
```ts
import { z } from 'zod';

export const PlayerSchema = z.object({
  userId: z.string(),
  displayName: z.string().min(1).max(32),
  joinedAt: z.number(),
  role: z.enum(['racer', 'spectator']).default('racer'),
});

export const RoomStatusSchema = z.enum(['lobby', 'countdown', 'racing', 'finished']);

export const RoomSchema = z.object({
  roomId: z.string(),
  joinCode: z.string().length(6),
  hostId: z.string(),
  snippetId: z.string(),
  status: RoomStatusSchema,
  players: z.array(PlayerSchema),
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
});

export const CreateRoomRequestSchema = z.object({
  hostDisplayName: z.string().min(1).max(32),
  language: z.string().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
});

export const CreateRoomResponseSchema = z.object({
  room: RoomSchema,
});

export const JoinRoomRequestSchema = z.object({
  joinCode: z.string().length(6),
  displayName: z.string().min(1).max(32),
  role: z.enum(['racer', 'spectator']).default('racer'),
});

// WS messages
export const WsClientCursorSchema = z.object({
  type: z.literal('cursor'),
  position: z.number().int().min(0),
  ts: z.number(),
});
export const WsClientStartSchema = z.object({ type: z.literal('start') });
export const WsClientFinishSchema = z.object({
  type: z.literal('finish'),
  finalPosition: z.number().int(),
  durationMs: z.number().int(),
  errors: z.number().int().min(0),
});
export const WsClientHeartbeatSchema = z.object({ type: z.literal('heartbeat') });
export const WsClientChatSchema = z.object({
  type: z.literal('chat'),
  text: z.string().min(1).max(280),
});

export const WsClientMsgSchema = z.discriminatedUnion('type', [
  WsClientCursorSchema,
  WsClientStartSchema,
  WsClientFinishSchema,
  WsClientHeartbeatSchema,
  WsClientChatSchema,
]);

export type Room = z.infer<typeof RoomSchema>;
export type Player = z.infer<typeof PlayerSchema>;
export type WsClientMsg = z.infer<typeof WsClientMsgSchema>;
// ...etc
```

Add `./schemas` to `shared/package.json` exports.

### New: `lambdas/src/AppError.ts`
```ts
export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? code);
  }
}

export const Errors = {
  NotFound: (what: string) => new AppError('NOT_FOUND', 404, `${what} not found`),
  Forbidden: () => new AppError('FORBIDDEN', 403),
  RateLimited: () => new AppError('RATE_LIMITED', 429),
  BadRequest: (msg: string) => new AppError('BAD_REQUEST', 400, msg),
  Conflict: (msg: string) => new AppError('CONFLICT', 409, msg),
};
```

### New: `lambdas/src/middleware.ts`
```ts
import type { z } from 'zod';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AppError } from './AppError.js';

type HttpHandler<I, O> = (input: I, ctx: { requestId: string; userId?: string }) => Promise<O>;

export function withHttp<I, O>(
  inputSchema: z.ZodSchema<I>,
  handler: HttpHandler<I, O>,
): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2> {
  return async (event) => {
    const requestId = event.requestContext.requestId;
    const start = Date.now();
    try {
      const body = event.body ? JSON.parse(event.body) : {};
      const input = inputSchema.parse(body);
      const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
      const out = await handler(input, { requestId, userId });
      log({ requestId, route: event.routeKey, status: 200, ms: Date.now() - start });
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(out) };
    } catch (err) {
      return errorResponse(err, requestId, start, event.routeKey);
    }
  };
}

export function withWs<I>(
  inputSchema: z.ZodSchema<I>,
  handler: (input: I, ctx: { connectionId: string; requestId: string }) => Promise<void>,
) { /* analogous, posts errors via postToConnection */ }
```

### New: `lambdas/src/repos/`
- `RoomRepo.ts` — `create`, `get`, `getByJoinCode`, `addPlayer`, `removePlayer`, `setStatus`, `recordFinish`.
- `UserRepo.ts` — `getOrCreate`, `getProfile`, `updateRating`, `recordRace`.
- `HistoryRepo.ts` — `list(userId, limit)`, `append(entry)`.
- `ConnectionRepo.ts` — `set`, `del`, `byRoom`.
- `SnippetRepo.ts` — `random(filters)`, `list(filters)`, `getById`.

Each repo takes a `DynamoDBDocumentClient` in constructor; module exports a default singleton bound to env-configured client.

### Handler migrations
Every handler in `lambdas/http/*` and `lambdas/ws/*` reduces to:
```ts
import { withHttp } from '../src/middleware.js';
import { CreateRoomRequestSchema, CreateRoomResponseSchema } from '@codetype/shared/schemas';
import { rooms } from '../src/repos/RoomRepo.js';

export const handler = withHttp(CreateRoomRequestSchema, async (input, ctx) => {
  const room = await rooms.create({ hostDisplayName: input.hostDisplayName, ... });
  return CreateRoomResponseSchema.parse({ room });
});
```

### Deletions
- `lambdas/src/http-resp.ts` (subsumed by middleware)
- Inline try/catch and JSON.stringify in every handler.

## Acceptance criteria

- [ ] All handlers use `withHttp` or `withWs`.
- [ ] All HTTP error responses have shape `{ error: { code, message, details? } }`.
- [ ] No handler imports `JSON.stringify` for response building.
- [ ] No handler imports `@aws-sdk/lib-dynamodb` directly — only repos do.
- [ ] All inputs validated against a schema before reaching business logic.
- [ ] CloudWatch logs include `{requestId, route, status, ms}` per request.
- [ ] Existing E2E behavior unchanged (smoke: host → join → race → finish).

## Test plan

- `lambdas/tests/middleware.test.ts` — covers: valid input, schema failure → 400, AppError → mapped status, unknown error → 500, logging shape.
- `lambdas/tests/repos/RoomRepo.test.ts` — using `aws-sdk-client-mock`; covers create/get/addPlayer/setStatus.
- `lambdas/tests/repos/UserRepo.test.ts` — getOrCreate idempotency, rating updates.
- `lambdas/tests/handlers/*.test.ts` — one happy-path test per handler with mocked repos.
- `shared/tests/schemas.test.ts` — round-trip parse for each schema; reject obvious invalid inputs.

## Risks / mitigations

- **Risk:** Zod adds bundle weight to Lambdas.
  - **Mitigation:** ~50KB minified; acceptable. If problematic, swap to Valibot later (same API surface).
- **Risk:** `JSON.parse` of `event.body` throws on malformed input — must be caught by middleware, not crash the Lambda.
  - **Mitigation:** wrap in try/catch inside `withHttp`, map to `BAD_REQUEST`.
- **Risk:** Schema drift between `shared` and what handlers actually return.
  - **Mitigation:** handlers parse output through response schema before return (see example above).

## Estimate

3–4 days.
