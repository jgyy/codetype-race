import { describe, expect, test } from "bun:test";
import { evaluatePlayerAndFlag } from "../../src/stream/antiCheatProjection";
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
    actorId: string | null = null,
    payload: Record<string, unknown> = {},
    occurredAt?: string,
): RaceEvent {
    return {
        raceId: RID,
        seq: SEQ++,
        type,
        occurredAt: occurredAt ?? new Date(1_700_000_000_000 + SEQ * 1000).toISOString(),
        actorId,
        payload,
        commandId: null,
        causationId: null,
        correlationId: CORR,
    };
}
function reset() { SEQ = 0; }

let outboxN = 0;
const newOutboxId = () => `ob-${++outboxN}`;

function buildDeps() {
    const idem = new FakeIdem();
    const events = new FakeEventStore();
    events.idemSink = idem;
    const bus = new RaceCommandBus({ eventStore: events, idempotencyStore: idem });
    const clock = new FixedClock(Date.parse("2026-05-09T00:00:30.000Z"));
    return { events, idem, bus, clock };
}

describe("evaluatePlayerAndFlag", () => {
    test("clean run: no flag emitted", async () => {
        reset();
        const { events, bus, clock } = buildDeps();
        // Realistic 50ms-batched deltas: ~3 chars per cursor event
        const log: RaceEvent[] = [
            ev("RACE_CREATED"),
            ev("PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" }),
            ev("RACE_STARTED", null, {}, "2026-05-09T00:00:00.000Z"),
        ];
        for (let i = 1; i <= 20; i++) {
            log.push(
                ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: i * 3 }),
            );
        }
        log.push(
            ev("PLAYER_FINISHED", "u1", {
                finishedAt: "2026-05-09T00:00:30.000Z",
                charsTyped: 60, accuracy: 1, wpm: 24,
            }),
        );
        events.log = log;
        const before = events.log.length;
        const result = await evaluatePlayerAndFlag(RID, "u1", {
            eventStore: events, bus, clock, newOutboxId,
        });
        expect(result.flagged).toBe(false);
        expect(events.log).toHaveLength(before); // no PLAYER_FLAGGED appended
    });

    test("paste-shape run: PLAYER_FLAGGED appended with reason and signals", async () => {
        reset();
        outboxN = 0;
        const { events, bus, clock } = buildDeps();
        events.log = [
            ev("RACE_CREATED"),
            ev("PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" }),
            ev("RACE_STARTED", null, {}, "2026-05-09T00:00:00.000Z"),
            // single 100-char advance — paste-suspected
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 100 }),
            ev("PLAYER_FINISHED", "u1", {
                finishedAt: "2026-05-09T00:00:30.000Z",
                charsTyped: 100, accuracy: 1, wpm: 40,
            }),
        ];
        const result = await evaluatePlayerAndFlag(RID, "u1", {
            eventStore: events, bus, clock, newOutboxId,
        });
        expect(result.flagged).toBe(true);
        expect(result.signals).toContain("PASTE_SUSPECTED");

        const flagEvent = events.log.find((e) => e.type === "PLAYER_FLAGGED");
        expect(flagEvent).toBeDefined();
        expect(flagEvent!.actorId).toBe("u1");
        expect(String(flagEvent!.payload.reason)).toContain("PASTE_SUSPECTED");
        expect(Array.isArray(flagEvent!.payload.signals)).toBe(true);
    });

    test("idempotent re-evaluation: re-running on the same input does not double-flag", async () => {
        reset();
        outboxN = 0;
        const { events, bus, clock, idem } = buildDeps();
        events.log = [
            ev("RACE_STARTED", null, {}, "2026-05-09T00:00:00.000Z"),
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 100 }),
            ev("PLAYER_FINISHED", "u1", {
                finishedAt: "2026-05-09T00:00:30.000Z",
                charsTyped: 100, accuracy: 1, wpm: 40,
            }),
        ];
        await evaluatePlayerAndFlag(RID, "u1", { eventStore: events, bus, clock, newOutboxId });
        const after1 = events.log.filter((e) => e.type === "PLAYER_FLAGGED").length;
        // Second invocation: bus's idempotency cache (deterministic commandId) short-circuits
        await evaluatePlayerAndFlag(RID, "u1", { eventStore: events, bus, clock, newOutboxId });
        const after2 = events.log.filter((e) => e.type === "PLAYER_FLAGGED").length;
        expect(after1).toBe(1);
        expect(after2).toBe(1);
    });
});
