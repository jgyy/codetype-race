import { describe, expect, test } from "bun:test";
import { projectRace } from "../../src/stream/raceProjection";
import {
    initialRaceState,
    reduce,
    type RaceState,
} from "@codetype/domain/RaceReducer";
import { ProjectionConflictError } from "@codetype/domain/ports/RaceProjectionStore";
import type {
    AppendCommandArgs,
    RaceEventStore,
    RaceProjectionStore,
} from "@codetype/domain/ports";
import type { RaceEvent, RaceEventType } from "@codetype/domain/events/RaceEvent";

const RID = "11111111-1111-4111-8111-111111111111";
const CORR = "22222222-2222-4222-8222-222222222222";

function ev(
    seq: number,
    type: RaceEventType = "RACE_CREATED",
    actorId: string | null = null,
    payload: Record<string, unknown> = {},
): RaceEvent {
    return {
        raceId: RID,
        seq,
        type,
        occurredAt: new Date(1_700_000_000_000 + seq * 1000).toISOString(),
        actorId,
        payload,
        commandId: null,
        causationId: null,
        correlationId: CORR,
    };
}

class FakeProjectionStore implements RaceProjectionStore {
    public state: RaceState | null = null;
    public puts = 0;
    public failNextWith: Error | null = null;
    async get(_raceId: string) {
        return this.state ? structuredClone(this.state) : null;
    }
    async put(args: { raceId: string; state: RaceState; expectedLastSeq: number | null }) {
        if (this.failNextWith) {
            const e = this.failNextWith;
            this.failNextWith = null;
            throw e;
        }
        const have = this.state?.lastSeq ?? null;
        if (args.expectedLastSeq !== have) {
            throw new ProjectionConflictError(
                `expected ${args.expectedLastSeq}, have ${have}`,
            );
        }
        this.state = structuredClone(args.state);
        this.puts++;
    }
}

class FakeEventStore implements RaceEventStore {
    public log: RaceEvent[] = [];
    constructor(seed: RaceEvent[] = []) { this.log = [...seed]; }
    async allocateSeqs(): Promise<number[]> { throw new Error("unused"); }
    async appendCommand(_a: AppendCommandArgs): Promise<void> { throw new Error("unused"); }
    async listEvents(args: { raceId: string; sinceSeq: number; limit: number }): Promise<RaceEvent[]> {
        return this.log
            .filter((e) => e.raceId === args.raceId && e.seq > args.sinceSeq)
            .slice(0, args.limit);
    }
}

describe("projectRace", () => {
    test("first run from empty: writes projection with attribute_not_exists path", async () => {
        const projection = new FakeProjectionStore();
        const events = new FakeEventStore();
        const out = await projectRace(RID, [ev(0), ev(1, "PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" })], {
            eventStore: events,
            projectionStore: projection,
        });
        expect(out.appliedSeqs).toEqual([0, 1]);
        expect(out.skippedSeqs).toEqual([]);
        expect(out.backfilled).toBe(0);
        expect(out.finalLastSeq).toBe(1);
        expect(projection.state!.lastSeq).toBe(1);
        expect(projection.state!.players.u1).toBeDefined();
    });

    test("idempotent under at-least-once redelivery — re-applying produces same state", async () => {
        const projection = new FakeProjectionStore();
        const events = new FakeEventStore();
        const batch = [ev(0), ev(1, "PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" })];
        await projectRace(RID, batch, { eventStore: events, projectionStore: projection });
        const before = structuredClone(projection.state);
        const out = await projectRace(RID, batch, {
            eventStore: events,
            projectionStore: projection,
        });
        expect(out.appliedSeqs).toEqual([]);
        expect(out.skippedSeqs).toEqual([0, 1]);
        expect(projection.state).toEqual(before);
    });

    test("backfills from event store when stream batch has a gap", async () => {
        const projection = new FakeProjectionStore();
        // Stream-skipped event seq=1 is recoverable from the log
        const missing = ev(1, "PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" });
        const events = new FakeEventStore([ev(0), missing, ev(2, "COUNTDOWN_STARTED")]);

        // Stream batch arrives with 0 + 2 (gap at 1)
        const out = await projectRace(RID, [ev(0), ev(2, "COUNTDOWN_STARTED")], {
            eventStore: events,
            projectionStore: projection,
        });
        expect(out.appliedSeqs).toEqual([0, 1, 2]);
        expect(out.backfilled).toBeGreaterThan(0);
        expect(projection.state!.status).toBe("countdown");
        expect(projection.state!.players.u1).toBeDefined();
    });

    test("retries once on ProjectionConflictError caused by a concurrent writer", async () => {
        const projection = new FakeProjectionStore();
        // Pre-seed a state showing seq=0 was already applied by another worker
        projection.state = reduce(initialRaceState(), ev(0));
        const events = new FakeEventStore();

        // Inject a one-shot conflict on the next put; the retry should succeed
        const original = projection.put.bind(projection);
        let calls = 0;
        projection.put = async (args) => {
            calls++;
            if (calls === 1) throw new ProjectionConflictError("concurrent write");
            await original(args);
        };

        const out = await projectRace(RID, [ev(0), ev(1, "PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" })], {
            eventStore: events,
            projectionStore: projection,
        });
        expect(out.finalLastSeq).toBe(1);
        expect(calls).toBeGreaterThanOrEqual(2);
    });

    test("throws if the event store cannot supply the missing events for a gap", async () => {
        const projection = new FakeProjectionStore();
        const events = new FakeEventStore(); // empty log → backfill yields nothing
        await expect(
            projectRace(RID, [ev(2, "COUNTDOWN_STARTED")], {
                eventStore: events,
                projectionStore: projection,
            }),
        ).rejects.toThrow(/projection gap/);
    });

    test("empty stream batch is a no-op", async () => {
        const projection = new FakeProjectionStore();
        const events = new FakeEventStore();
        const out = await projectRace(RID, [], { eventStore: events, projectionStore: projection });
        expect(out.appliedSeqs).toEqual([]);
        expect(projection.state).toBeNull();
        expect(projection.puts).toBe(0);
    });
});
