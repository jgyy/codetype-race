import { describe, expect, test } from "bun:test";
import { RaceCommandBus } from "../../src/services/RaceCommandBus";
import {
    IdempotencyConflictError,
    type IdempotencyRecord,
    type IdempotencyStore,
} from "../../src/ports/IdempotencyStore";
import {
    TransactionConflictError,
    type AppendCommandArgs,
    type RaceEventStore,
} from "../../src/ports/RaceEventStore";
import type { Clock } from "../../src/ports/Clock";
import type { RaceEvent } from "../../src/events/RaceEvent";

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
    async get(userId: string, commandId: string) {
        return this.rows.get(this.k(userId, commandId)) ?? null;
    }
    async put(record: IdempotencyRecord) {
        const key = this.k(record.userId, record.commandId);
        const existing = this.rows.get(key);
        if (existing) throw new IdempotencyConflictError(existing);
        this.rows.set(key, record);
    }
    /** Test-only seed. */
    seed(rec: IdempotencyRecord) {
        this.rows.set(this.k(rec.userId, rec.commandId), rec);
    }
}

class FakeEventStore implements RaceEventStore {
    public counter = new Map<string, number>();
    public appended: RaceEvent[] = [];
    public outboxIds: string[] = [];
    public idem?: IdempotencyRecord;
    public failNextAppendWith: Error | null = null;
    public idemBeforeAppend?: FakeIdem;
    /** When set, idempotency rows are mirrored into this store as part of the
     * "transaction" — matches the real adapter's TransactWriteItems semantics. */
    public idemSink?: FakeIdem;

    async allocateSeqs(raceId: string, count: number) {
        const cur = this.counter.get(raceId) ?? 0;
        const next = cur + count;
        this.counter.set(raceId, next);
        return Array.from({ length: count }, (_, i) => cur + i);
    }
    async appendCommand(args: AppendCommandArgs) {
        if (this.failNextAppendWith) {
            const e = this.failNextAppendWith;
            this.failNextAppendWith = null;
            if (this.idemBeforeAppend && args.idempotency) {
                this.idemBeforeAppend.seed({
                    ...args.idempotency,
                    body: { winnerWasFirst: true },
                });
            }
            throw e;
        }
        for (const ev of args.events) this.appended.push(ev);
        for (const ob of args.outboxEntries ?? []) this.outboxIds.push(ob.id);
        if (args.idempotency) {
            this.idem = args.idempotency;
            if (this.idemSink) this.idemSink.seed(args.idempotency);
        }
    }
    async listEvents() { return []; }
}

let outboxCounter = 0;
function newOutboxId() { return `ob-${++outboxCounter}`; }

describe("RaceCommandBus.dispatch", () => {
    test("happy path: handler runs, seqs allocated, events + outbox + idempotency written together", async () => {
        outboxCounter = 0;
        const idem = new FakeIdem();
        const events = new FakeEventStore();
        const bus = new RaceCommandBus({ eventStore: events, idempotencyStore: idem });
        const clock = new FixedClock(Date.parse("2026-05-09T00:00:00.000Z"));

        const out = await bus.dispatch({
            userId: "u1",
            commandId: CID,
            raceId: RID,
            newOutboxId,
            clock,
            handler: async () => ({
                events: [
                    { type: "RACE_CREATED", actorId: "u1", payload: {} },
                    { type: "PLAYER_JOINED", actorId: "u1", payload: { userId: "u1", displayName: "A" } },
                ],
                result: { raceId: RID, status: "lobby" },
            }),
        });

        expect(out.replay).toBe(false);
        expect(out.httpStatus).toBe(200);
        expect(out.events).toHaveLength(2);
        expect(out.events.map((e) => e.seq)).toEqual([0, 1]);
        expect(out.events.every((e) => e.commandId === CID)).toBe(true);
        expect(out.events.every((e) => e.correlationId === CID)).toBe(true);
        expect(events.appended).toHaveLength(2);
        expect(events.outboxIds).toEqual(["ob-1", "ob-2"]);
        expect(events.idem?.userId).toBe("u1");
        expect(events.idem?.body).toEqual({ raceId: RID, status: "lobby" });
    });

    test("idempotent retry returns cached body without re-running handler", async () => {
        const idem = new FakeIdem();
        idem.seed({
            userId: "u1",
            commandId: CID,
            httpStatus: 201,
            body: { cached: true, raceId: RID },
            storedAt: "2026-05-09T00:00:00.000Z",
            ttl: 3600,
        });
        const events = new FakeEventStore();
        const bus = new RaceCommandBus({ eventStore: events, idempotencyStore: idem });
        const clock = new FixedClock(Date.parse("2026-05-09T00:00:00.000Z"));

        let handlerRan = false;
        const out = await bus.dispatch({
            userId: "u1",
            commandId: CID,
            raceId: RID,
            newOutboxId,
            clock,
            handler: async () => {
                handlerRan = true;
                return { events: [], result: null };
            },
        });

        expect(handlerRan).toBe(false);
        expect(out.replay).toBe(true);
        expect(out.httpStatus).toBe(201);
        expect(out.result).toEqual({ cached: true, raceId: RID });
        expect(events.appended).toHaveLength(0);
    });

    test("transaction conflict caused by a concurrent winner -> replay path", async () => {
        const idem = new FakeIdem();
        const events = new FakeEventStore();
        events.idemBeforeAppend = idem;
        events.failNextAppendWith = new TransactionConflictError(
            "appendCommand transaction cancelled: ConditionalCheckFailed",
        );
        const bus = new RaceCommandBus({ eventStore: events, idempotencyStore: idem });
        const clock = new FixedClock(Date.parse("2026-05-09T00:00:00.000Z"));

        const out = await bus.dispatch({
            userId: "u1",
            commandId: CID,
            raceId: RID,
            newOutboxId,
            clock,
            handler: async () => ({
                events: [{ type: "RACE_CREATED", actorId: "u1", payload: {} }],
                result: { mine: true },
            }),
        });

        expect(out.replay).toBe(true);
        expect(out.result).toEqual({ winnerWasFirst: true });
    });

    test("transaction conflict with no idempotency row → propagates the error", async () => {
        const idem = new FakeIdem();
        const events = new FakeEventStore();
        events.failNextAppendWith = new TransactionConflictError(
            "appendCommand transaction cancelled: SomethingElse",
        );
        const bus = new RaceCommandBus({ eventStore: events, idempotencyStore: idem });
        const clock = new FixedClock(Date.parse("2026-05-09T00:00:00.000Z"));

        await expect(
            bus.dispatch({
                userId: "u1",
                commandId: CID,
                raceId: RID,
                newOutboxId,
                clock,
                handler: async () => ({
                    events: [{ type: "RACE_CREATED", actorId: "u1", payload: {} }],
                    result: null,
                }),
            }),
        ).rejects.toThrow(/SomethingElse/);
    });

    test("outboxChannelsFor allows per-event channel fan-out and suppression", async () => {
        outboxCounter = 0;
        const idem = new FakeIdem();
        const events = new FakeEventStore();
        const bus = new RaceCommandBus({ eventStore: events, idempotencyStore: idem });
        const clock = new FixedClock(Date.parse("2026-05-09T00:00:00.000Z"));

        const out = await bus.dispatch({
            userId: "u1",
            commandId: CID,
            raceId: RID,
            newOutboxId,
            clock,
            handler: async () => ({
                events: [
                    { type: "CURSOR_PROGRESS", actorId: "u1", payload: { userId: "u1", charsTyped: 5, errors: 0, accuracy: 1 } },
                    { type: "PLAYER_FINISHED", actorId: "u1", payload: { finishedAt: "2026-05-09T00:00:30.000Z", charsTyped: 200, accuracy: 0.99, wpm: 80 } },
                ],
                outboxChannelsFor: (draft) =>
                    draft.type === "CURSOR_PROGRESS"
                        ? []
                        : ["broadcast", "progression", "analytics"],
                result: { ok: true },
            }),
        });

        expect(out.events).toHaveLength(2);
        expect(events.outboxIds).toHaveLength(3);
        expect(events.outboxIds).toEqual(["ob-1", "ob-2", "ob-3"]);
    });

    test("uses event's occurredAt if provided, otherwise clock", async () => {
        const idem = new FakeIdem();
        const events = new FakeEventStore();
        const bus = new RaceCommandBus({ eventStore: events, idempotencyStore: idem });
        const clock = new FixedClock(Date.parse("2026-05-09T00:00:05.000Z"));

        await bus.dispatch({
            userId: "u1",
            commandId: CID,
            raceId: RID,
            newOutboxId,
            clock,
            handler: async () => ({
                events: [
                    { type: "RACE_CREATED", actorId: null, payload: {}, occurredAt: "2026-05-09T00:00:01.000Z" },
                    { type: "PLAYER_JOINED", actorId: "u1", payload: {} },
                ],
                result: null,
            }),
        });

        expect(events.appended[0].occurredAt).toBe("2026-05-09T00:00:01.000Z");
        expect(events.appended[1].occurredAt).toBe("2026-05-09T00:00:05.000Z");
    });

    test("empty events: still writes idempotency row so handler doesn't re-run", async () => {
        const idem = new FakeIdem();
        const events = new FakeEventStore();
        events.idemSink = idem;
        const bus = new RaceCommandBus({ eventStore: events, idempotencyStore: idem });
        const clock = new FixedClock(Date.parse("2026-05-09T00:00:00.000Z"));

        const out = await bus.dispatch({
            userId: "u1",
            commandId: CID,
            raceId: RID,
            newOutboxId,
            clock,
            handler: async () => ({ events: [], result: { noop: true } }),
        });

        expect(out.replay).toBe(false);
        expect(out.events).toHaveLength(0);
        expect(events.appended).toHaveLength(0);
        expect(events.idem?.body).toEqual({ noop: true });

        const out2 = await bus.dispatch({
            userId: "u1",
            commandId: CID,
            raceId: RID,
            newOutboxId,
            clock,
            handler: async () => {
                throw new Error("handler should not run on replay");
            },
        });
        expect(out2.replay).toBe(true);
        expect(out2.result).toEqual({ noop: true });
    });
});
