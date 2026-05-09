import { describe, expect, test } from "bun:test";
import {
    CreateRaceRequestSchema,
    withRaceCommand,
} from "../../src/raceCommand";
import { RaceCommandBus } from "@codetype/domain/RaceCommandBus";
import {
    IdempotencyConflictError,
    type IdempotencyRecord,
    type IdempotencyStore,
} from "@codetype/domain/ports/IdempotencyStore";
import type {
    AppendCommandArgs,
    RaceEventStore,
} from "@codetype/domain/ports/RaceEventStore";
import type { Clock } from "@codetype/domain/ports";
import type { RaceEvent } from "@codetype/domain/events/RaceEvent";

const RID = "11111111-1111-4111-8111-111111111111";
const CID = "33333333-3333-4333-8333-333333333333";

class FixedClock implements Clock {
    constructor(public ms: number) { }
    epochMs() { return this.ms; }
    now() { return new Date(this.ms); }
}

class FakeIdem implements IdempotencyStore {
    private rows = new Map<string, IdempotencyRecord>();
    private k(u: string, c: string) { return `${u}\x00${c}`; }
    async get(u: string, c: string) { return this.rows.get(this.k(u, c)) ?? null; }
    async put(rec: IdempotencyRecord) {
        const key = this.k(rec.userId, rec.commandId);
        if (this.rows.has(key)) throw new IdempotencyConflictError(this.rows.get(key)!);
        this.rows.set(key, rec);
    }
    seed(rec: IdempotencyRecord) { this.rows.set(this.k(rec.userId, rec.commandId), rec); }
}

class FakeEventStore implements RaceEventStore {
    public counter = new Map<string, number>();
    public appended: RaceEvent[] = [];
    public idemSink?: FakeIdem;
    async allocateSeqs(raceId: string, count: number) {
        const cur = this.counter.get(raceId) ?? 0;
        this.counter.set(raceId, cur + count);
        return Array.from({ length: count }, (_, i) => cur + i);
    }
    async appendCommand(args: AppendCommandArgs) {
        for (const e of args.events) this.appended.push(e);
        if (args.idempotency && this.idemSink) this.idemSink.seed(args.idempotency);
    }
    async listEvents() { return []; }
}

function makeEvent(opts: {
    body: unknown;
    userId?: string;
    idempotencyKey?: string;
    headers?: Record<string, string>;
}): any {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.idempotencyKey !== undefined) {
        headers["Idempotency-Key"] = opts.idempotencyKey;
    }
    return {
        body: typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
        headers,
        routeKey: "POST /races",
        requestContext: {
            requestId: "req-1",
            http: { method: "POST", path: "/races" },
            authorizer: opts.userId
                ? { jwt: { claims: { sub: opts.userId } } }
                : undefined,
        },
    };
}

let outboxCounter = 0;
function newOutboxId() { return `ob-${++outboxCounter}`; }

function buildHandler(bus: RaceCommandBus) {
    return withRaceCommand({
        inputSchema: CreateRaceRequestSchema,
        bus,
        clock: new FixedClock(Date.parse("2026-05-09T00:00:00.000Z")),
        newOutboxId,
        raceId: (i) => i.raceId,
        build: async (input, ctx) => ({
            events: [
                { type: "RACE_CREATED", actorId: ctx.userId, payload: { snippetId: input.snippetId } },
                {
                    type: "PLAYER_JOINED",
                    actorId: ctx.userId,
                    payload: { userId: ctx.userId, displayName: input.displayName },
                },
            ],
            result: { raceId: input.raceId, status: "lobby" as const },
            httpStatus: 201,
        }),
    });
}

describe("withRaceCommand + createRace end-to-end", () => {
    test("happy path: 201 with event-sourced events, no replay header", async () => {
        outboxCounter = 0;
        const idem = new FakeIdem();
        const events = new FakeEventStore();
        events.idemSink = idem;
        const handler = buildHandler(new RaceCommandBus({ eventStore: events, idempotencyStore: idem }));

        const res = await handler(
            makeEvent({
                body: { raceId: RID, snippetId: "snip-1", displayName: "Alice" },
                userId: "u1",
                idempotencyKey: CID,
            }),
        ) as any;

        expect(res.statusCode).toBe(201);
        expect(res.headers["X-Idempotent-Replay"]).toBeUndefined();
        const body = JSON.parse(res.body);
        expect(body).toEqual({ raceId: RID, status: "lobby" });

        expect(events.appended).toHaveLength(2);
        expect(events.appended[0].type).toBe("RACE_CREATED");
        expect(events.appended[0].seq).toBe(0);
        expect(events.appended[0].commandId).toBe(CID);
        expect(events.appended[0].correlationId).toBe("req-1");
        expect(events.appended[1].type).toBe("PLAYER_JOINED");
        expect(events.appended[1].seq).toBe(1);
    });

    test("retry with same Idempotency-Key returns cached body + replay header", async () => {
        const idem = new FakeIdem();
        const events = new FakeEventStore();
        events.idemSink = idem;
        const handler = buildHandler(new RaceCommandBus({ eventStore: events, idempotencyStore: idem }));

        const first = (await handler(
            makeEvent({
                body: { raceId: RID, snippetId: "snip-1", displayName: "Alice" },
                userId: "u1",
                idempotencyKey: CID,
            }),
        )) as any;
        expect(first.statusCode).toBe(201);

        const second = (await handler(
            makeEvent({
                body: { raceId: RID, snippetId: "snip-1", displayName: "Alice" },
                userId: "u1",
                idempotencyKey: CID,
            }),
        )) as any;
        expect(second.statusCode).toBe(201);
        expect(second.headers["X-Idempotent-Replay"]).toBe("true");
        // Handler did not run again — event log unchanged
        expect(events.appended).toHaveLength(2);
    });

    test("missing Idempotency-Key header → 400 idempotency.missing", async () => {
        const idem = new FakeIdem();
        const events = new FakeEventStore();
        const handler = buildHandler(new RaceCommandBus({ eventStore: events, idempotencyStore: idem }));

        const res = (await handler(
            makeEvent({
                body: { raceId: RID, snippetId: "snip-1", displayName: "Alice" },
                userId: "u1",
            }),
        )) as any;
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error.code).toBe("idempotency.missing");
        expect(events.appended).toHaveLength(0);
    });

    test("invalid Idempotency-Key (non-UUID) → 400 idempotency.invalid", async () => {
        const idem = new FakeIdem();
        const events = new FakeEventStore();
        const handler = buildHandler(new RaceCommandBus({ eventStore: events, idempotencyStore: idem }));

        const res = (await handler(
            makeEvent({
                body: { raceId: RID, snippetId: "snip-1", displayName: "Alice" },
                userId: "u1",
                idempotencyKey: "not-a-uuid",
            }),
        )) as any;
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error.code).toBe("idempotency.invalid");
    });

    test("missing JWT (no userId) → 401", async () => {
        const idem = new FakeIdem();
        const events = new FakeEventStore();
        const handler = buildHandler(new RaceCommandBus({ eventStore: events, idempotencyStore: idem }));

        const res = (await handler(
            makeEvent({
                body: { raceId: RID, snippetId: "snip-1", displayName: "Alice" },
                idempotencyKey: CID,
            }),
        )) as any;
        expect(res.statusCode).toBe(401);
    });

    test("invalid request body → 400 BAD_REQUEST (zod validation)", async () => {
        const idem = new FakeIdem();
        const events = new FakeEventStore();
        const handler = buildHandler(new RaceCommandBus({ eventStore: events, idempotencyStore: idem }));

        const res = (await handler(
            makeEvent({
                body: { raceId: "not-a-uuid", snippetId: "s", displayName: "A" },
                userId: "u1",
                idempotencyKey: CID,
            }),
        )) as any;
        expect(res.statusCode).toBe(400);
    });

    test("header lookup is case-insensitive (idempotency-key)", async () => {
        const idem = new FakeIdem();
        const events = new FakeEventStore();
        events.idemSink = idem;
        const handler = buildHandler(new RaceCommandBus({ eventStore: events, idempotencyStore: idem }));

        const res = (await handler(
            makeEvent({
                body: { raceId: RID, snippetId: "snip-1", displayName: "Alice" },
                userId: "u1",
                headers: { "idempotency-key": CID },
            }),
        )) as any;
        expect(res.statusCode).toBe(201);
    });
});
