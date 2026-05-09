import { describe, expect, test } from "bun:test";
import { compactRace } from "../../src/stream/compactRace";
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
import type { RaceEvent, RaceEventType } from "@codetype/domain/events/RaceEvent";

const RID = "11111111-1111-4111-8111-111111111111";
const CORR = "22222222-2222-4222-8222-222222222222";
const START_MS = Date.parse("2026-05-09T00:00:00.000Z");

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
    public log: RaceEvent[] = [];
    public counter = new Map<string, number>();
    public idemSink?: FakeIdem;
    constructor(seed: RaceEvent[] = []) { this.log = [...seed]; }
    async allocateSeqs(raceId: string, count: number) {
        const cur = this.counter.get(raceId) ?? this.log.length;
        this.counter.set(raceId, cur + count);
        return Array.from({ length: count }, (_, i) => cur + i);
    }
    async appendCommand(args: AppendCommandArgs) {
        for (const e of args.events) this.log.push(e);
        if (args.idempotency && this.idemSink) this.idemSink.seed(args.idempotency);
    }
    async listEvents(args: { raceId: string; sinceSeq: number; limit: number }) {
        return this.log
            .filter((e) => e.raceId === args.raceId && (args.sinceSeq < 0 || e.seq > args.sinceSeq))
            .slice(0, args.limit);
    }
}

let SEQ = 0;
function ev(
    type: RaceEventType,
    actorId: string | null,
    payload: Record<string, unknown>,
    occurredMsOffset: number,
): RaceEvent {
    return {
        raceId: RID,
        seq: SEQ++,
        type,
        occurredAt: new Date(START_MS + occurredMsOffset).toISOString(),
        actorId,
        payload,
        commandId: null,
        causationId: null,
        correlationId: CORR,
    };
}
function reset() { SEQ = 0; }

let outboxN = 0;
const newOutboxId = () => `cd-${++outboxN}`;

function buildDeps() {
    const idem = new FakeIdem();
    const events = new FakeEventStore();
    events.idemSink = idem;
    const bus = new RaceCommandBus({ eventStore: events, idempotencyStore: idem });
    const clock = new FixedClock(START_MS + 31_000);
    return { events, idem, bus, clock };
}

describe("compactRace", () => {
    test("emits a CURSOR_DIGEST event with a downsampled per-player sample stream", async () => {
        reset();
        outboxN = 0;
        const { events, bus, clock } = buildDeps();
        events.log = [
            ev("RACE_CREATED", null, {}, 0),
            ev("RACE_STARTED", null, {}, 0),
        ];
        for (let i = 1; i <= 20; i++) {
            events.log.push(
                ev("CURSOR_PROGRESS", "u1", {
                    userId: "u1", charsTyped: i, accuracy: 1,
                }, i * 50),
            );
        }
        events.log.push(ev("RACE_FINISHED", null, {}, 1000));
        const result = await compactRace(RID, {
            eventStore: events, bus, clock, newOutboxId,
        });
        expect(result.compacted).toBe(true);
        expect(result.samples).toBeGreaterThan(0);

        const digest = events.log.find((e) => e.type === "CURSOR_DIGEST");
        expect(digest).toBeDefined();
        const payload = digest!.payload as any;
        expect(payload.raceId).toBe(RID);
        expect(payload.bucketMs).toBe(200);
        expect(payload.perPlayer.u1.length).toBeGreaterThanOrEqual(5);
    });

    test("idempotent — second compactRace call is a no-op (already_compacted)", async () => {
        reset();
        const { events, bus, clock } = buildDeps();
        events.log = [
            ev("RACE_STARTED", null, {}, 0),
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 5, accuracy: 1 }, 100),
            ev("RACE_FINISHED", null, {}, 1000),
        ];
        await compactRace(RID, { eventStore: events, bus, clock, newOutboxId });
        const before = events.log.filter((e) => e.type === "CURSOR_DIGEST").length;
        const second = await compactRace(RID, {
            eventStore: events, bus, clock, newOutboxId,
        });
        const after = events.log.filter((e) => e.type === "CURSOR_DIGEST").length;
        expect(second.compacted).toBe(false);
        expect(second.reason).toBe("already_compacted");
        expect(before).toBe(after);
    });

    test("no-op when no CURSOR_PROGRESS events exist (lobby-only race)", async () => {
        reset();
        const { events, bus, clock } = buildDeps();
        events.log = [
            ev("RACE_CREATED", null, {}, 0),
            ev("RACE_STARTED", null, {}, 0),
            ev("RACE_FINISHED", null, {}, 1000),
        ];
        const result = await compactRace(RID, {
            eventStore: events, bus, clock, newOutboxId,
        });
        expect(result.compacted).toBe(false);
        expect(result.reason).toBe("no_cursor_events");
    });
});
