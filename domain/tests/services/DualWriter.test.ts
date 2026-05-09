import { describe, expect, test } from "bun:test";
import { dualWrite } from "../../src/services/DualWriter";
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
    public failNextAppendWith: Error | null = null;
    public idemSink?: FakeIdem;
    async allocateSeqs(raceId: string, count: number) {
        const cur = this.counter.get(raceId) ?? 0;
        this.counter.set(raceId, cur + count);
        return Array.from({ length: count }, (_, i) => cur + i);
    }
    async appendCommand(args: AppendCommandArgs) {
        if (this.failNextAppendWith) {
            const e = this.failNextAppendWith;
            this.failNextAppendWith = null;
            throw e;
        }
        for (const e of args.events) this.appended.push(e);
        if (args.idempotency && this.idemSink) this.idemSink.seed(args.idempotency);
    }
    async listEvents() { return []; }
}

interface LegacyRoom { roomId: string; hostId: string; displayName: string }

let outboxN = 0;
const newOutboxId = () => `ob-${++outboxN}`;

function buildBus() {
    outboxN = 0;
    const idem = new FakeIdem();
    const events = new FakeEventStore();
    events.idemSink = idem;
    const bus = new RaceCommandBus({ eventStore: events, idempotencyStore: idem });
    return { idem, events, bus };
}

const goodLegacy = async (): Promise<LegacyRoom> => ({
    roomId: RID,
    hostId: "u1",
    displayName: "Alice",
});

function eventBuilder(): (l: LegacyRoom) => any {
    return (l) => ({
        events: [
            {
                type: "RACE_CREATED",
                actorId: l.hostId,
                payload: {},
            },
            {
                type: "PLAYER_JOINED",
                actorId: l.hostId,
                payload: { userId: l.hostId, displayName: l.displayName },
            },
        ],
        result: { raceId: l.roomId },
    });
}

describe("dualWrite — happy path", () => {
    test("legacy succeeds, event side appends, both results returned", async () => {
        const { events, bus } = buildBus();
        const out = await dualWrite({
            legacy: goodLegacy,
            eventBuild: eventBuilder(),
            bus,
            raceId: (l) => l.roomId,
            userId: (l) => l.hostId,
            commandId: () => CID,
            newOutboxId,
            clock: new FixedClock(0),
        });
        expect(out.legacyResult.roomId).toBe(RID);
        expect(out.eventOutcome).not.toBeNull();
        expect(out.eventOutcome!.replay).toBe(false);
        expect(out.eventError).toBeNull();
        expect(events.appended).toHaveLength(2);
    });

    test("eventBuild returning null skips event side cleanly", async () => {
        const { events, bus } = buildBus();
        const out = await dualWrite({
            legacy: goodLegacy,
            eventBuild: () => null,
            bus,
            raceId: (l) => l.roomId,
            userId: (l) => l.hostId,
            commandId: () => CID,
            newOutboxId,
            clock: new FixedClock(0),
        });
        expect(out.legacyResult.roomId).toBe(RID);
        expect(out.eventOutcome).toBeNull();
        expect(out.eventError).toBeNull();
        expect(events.appended).toHaveLength(0);
    });
});

describe("dualWrite — legacy failure", () => {
    test("legacy throws -> error propagates, no event side fires", async () => {
        const { events, bus } = buildBus();
        const boom = new Error("legacy db down");
        await expect(
            dualWrite({
                legacy: async () => { throw boom; },
                eventBuild: eventBuilder(),
                bus,
                raceId: (l: any) => l.roomId,
                userId: (l: any) => l.hostId,
                commandId: () => CID,
                newOutboxId,
                clock: new FixedClock(0),
            }),
        ).rejects.toThrow(/legacy db down/);
        expect(events.appended).toHaveLength(0);
    });
});

describe("dualWrite — event-side failure (soft mode, default)", () => {
    test("event throws -> legacy result returned + onEventError called + eventError populated", async () => {
        const { events, bus } = buildBus();
        events.failNextAppendWith = new TransactionConflictError(
            "appendCommand transaction cancelled: SomethingWeird",
        );
        const errors: Error[] = [];
        const out = await dualWrite({
            legacy: goodLegacy,
            eventBuild: eventBuilder(),
            bus,
            raceId: (l) => l.roomId,
            userId: (l) => l.hostId,
            commandId: () => CID,
            newOutboxId,
            clock: new FixedClock(0),
            onEventError: (e) => errors.push(e),
        });
        expect(out.legacyResult.roomId).toBe(RID); // legacy still succeeds
        expect(out.eventOutcome).toBeNull();
        expect(out.eventError).not.toBeNull();
        expect(out.eventError!.message).toMatch(/SomethingWeird/);
        expect(errors).toHaveLength(1);
    });

    test("event-side failure passes legacyResult to onEventError for context", async () => {
        const { events, bus } = buildBus();
        events.failNextAppendWith = new Error("ddb 500");
        let capturedCtx: any = null;
        await dualWrite({
            legacy: goodLegacy,
            eventBuild: eventBuilder(),
            bus,
            raceId: (l) => l.roomId,
            userId: (l) => l.hostId,
            commandId: () => CID,
            newOutboxId,
            clock: new FixedClock(0),
            onEventError: (_e, ctx) => { capturedCtx = ctx; },
        });
        expect(capturedCtx.legacyResult.roomId).toBe(RID);
    });
});

describe("dualWrite — event-side failure (strict mode)", () => {
    test("event throws and strict=true -> error propagates", async () => {
        const { events, bus } = buildBus();
        events.failNextAppendWith = new Error("ddb 500");
        await expect(
            dualWrite({
                legacy: goodLegacy,
                eventBuild: eventBuilder(),
                bus,
                raceId: (l) => l.roomId,
                userId: (l) => l.hostId,
                commandId: () => CID,
                newOutboxId,
                clock: new FixedClock(0),
                strict: true,
            }),
        ).rejects.toThrow(/ddb 500/);
    });
});

describe("dualWrite — idempotency on the event side", () => {
    test("repeated dualWrite with same commandId hits idempotency cache (replay=true)", async () => {
        const { idem, events, bus } = buildBus();
        idem.seed({
            userId: "u1",
            commandId: CID,
            httpStatus: 200,
            body: { raceId: RID, cached: true },
            storedAt: "2026-05-09T00:00:00.000Z",
            ttl: 3600,
        });
        const out = await dualWrite({
            legacy: goodLegacy,
            eventBuild: eventBuilder(),
            bus,
            raceId: (l) => l.roomId,
            userId: (l) => l.hostId,
            commandId: () => CID,
            newOutboxId,
            clock: new FixedClock(0),
        });
        expect(out.eventOutcome!.replay).toBe(true);
        expect(events.appended).toHaveLength(0);
    });
});
