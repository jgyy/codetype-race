import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { __resetBusCache, maybeDualWrite } from "../src/raceDualWrite";
import { RaceCommandBus } from "@codetype/domain/RaceCommandBus";
import {
    IdempotencyConflictError,
    type IdempotencyRecord,
    type IdempotencyStore,
} from "@codetype/domain/ports/IdempotencyStore";
import {
    TransactionConflictError,
    type AppendCommandArgs,
    type RaceEventStore,
} from "@codetype/domain/ports/RaceEventStore";
import type { RaceEvent } from "@codetype/domain/events/RaceEvent";

const RID = "11111111-1111-4111-8111-111111111111";

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

interface LegacyRoom { room_id: string; code: string }

let events: FakeEventStore;
let idem: FakeIdem;

beforeEach(() => {
    idem = new FakeIdem();
    events = new FakeEventStore();
    events.idemSink = idem;
    const bus = new RaceCommandBus({ eventStore: events, idempotencyStore: idem });
    __resetBusCache(bus);
    delete process.env.PHASE_14_DUALWRITE;
});
afterEach(() => {
    __resetBusCache(null);
    delete process.env.PHASE_14_DUALWRITE;
});

const goodLegacy = async (): Promise<LegacyRoom> => ({
    room_id: RID,
    code: "ABC123",
});

function inputs(legacy: () => Promise<LegacyRoom>) {
    return {
        path: "createRoom",
        legacy,
        userId: () => "u1",
        raceId: (l: LegacyRoom) => l.room_id,
        toEvents: (l: LegacyRoom) => ({
            events: [
                {
                    type: "RACE_CREATED" as const,
                    actorId: "u1",
                    payload: { roomId: l.room_id, code: l.code },
                },
            ],
            result: { raceId: l.room_id },
        }),
    };
}

describe("maybeDualWrite — flag off (default)", () => {
    test("runs only the legacy operation; no events appended", async () => {
        const legacyResult = await maybeDualWrite(inputs(goodLegacy));
        expect(legacyResult.room_id).toBe(RID);
        expect(events.appended).toHaveLength(0);
    });

    test("legacy errors propagate unchanged with flag off", async () => {
        await expect(
            maybeDualWrite(
                inputs(async () => { throw new Error("legacy boom"); }),
            ),
        ).rejects.toThrow(/legacy boom/);
    });
});

describe("maybeDualWrite — flag on", () => {
    test("legacy succeeds + RACE_CREATED appended; legacy result returned unchanged", async () => {
        process.env.PHASE_14_DUALWRITE = "1";
        const legacyResult = await maybeDualWrite(inputs(goodLegacy));
        expect(legacyResult.room_id).toBe(RID);
        expect(events.appended).toHaveLength(1);
        expect(events.appended[0].type).toBe("RACE_CREATED");
        expect(events.appended[0].payload).toMatchObject({ roomId: RID, code: "ABC123" });
    });

    test("event-side failure does NOT fail the legacy response (soft mode default)", async () => {
        process.env.PHASE_14_DUALWRITE = "true";
        events.failNextAppendWith = new TransactionConflictError(
            "appendCommand transaction cancelled: SomeReason",
        );
        const legacyResult = await maybeDualWrite(inputs(goodLegacy));
        expect(legacyResult.room_id).toBe(RID);
        // Event store remained empty; legacy still succeeded.
        expect(events.appended).toHaveLength(0);
    });

    test("legacy error still propagates with flag on (no event side fires)", async () => {
        process.env.PHASE_14_DUALWRITE = "on";
        await expect(
            maybeDualWrite(
                inputs(async () => { throw new Error("legacy db down"); }),
            ),
        ).rejects.toThrow(/legacy db down/);
        expect(events.appended).toHaveLength(0);
    });

    test("deterministic commandId means duplicate dual-writes hit idempotency cache", async () => {
        process.env.PHASE_14_DUALWRITE = "1";
        // First run: legacy + event side both succeed; idem row written.
        await maybeDualWrite(inputs(goodLegacy));
        expect(events.appended).toHaveLength(1);
        // Second run: same legacy result -> same commandId -> bus replays.
        await maybeDualWrite(inputs(goodLegacy));
        // Event log unchanged because the bus short-circuited via the cache.
        expect(events.appended).toHaveLength(1);
    });

    test("toEvents returning null skips event side cleanly even when flag is on", async () => {
        process.env.PHASE_14_DUALWRITE = "1";
        const legacyResult = await maybeDualWrite({
            ...inputs(goodLegacy),
            toEvents: () => null,
        });
        expect(legacyResult.room_id).toBe(RID);
        expect(events.appended).toHaveLength(0);
    });

    test("custom commandIdFor overrides the default uuidv5(path:raceId)", async () => {
        process.env.PHASE_14_DUALWRITE = "1";
        const FIXED_CID = "44444444-4444-4444-8444-444444444444";
        await maybeDualWrite({
            ...inputs(goodLegacy),
            commandIdFor: () => FIXED_CID,
        });
        expect(events.appended[0].commandId).toBe(FIXED_CID);
    });
});

describe("maybeDualWrite — flag values", () => {
    test.each([
        ["1", true],
        ["true", true],
        ["on", true],
        ["0", false],
        ["false", false],
        ["off", false],
        ["", false],
    ])("flag value %p -> dual-write %p", async (val, expectsDual) => {
        if (val) process.env.PHASE_14_DUALWRITE = val;
        await maybeDualWrite(inputs(goodLegacy));
        expect(events.appended).toHaveLength(expectsDual ? 1 : 0);
    });
});
