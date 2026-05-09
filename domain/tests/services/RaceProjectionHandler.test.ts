import { describe, expect, test } from "bun:test";
import {
    applyEventBatch,
    ProjectionGapError,
} from "../../src/services/RaceProjectionHandler";
import { initialRaceState, reduce } from "../../src/services/RaceReducer";
import type { RaceEvent, RaceEventType } from "../../src/events/RaceEvent";

const RID = "11111111-1111-4111-8111-111111111111";
const CORR = "22222222-2222-4222-8222-222222222222";

function ev(
    seq: number,
    type: RaceEventType,
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

describe("applyEventBatch", () => {
    test("applies a contiguous batch starting at lastSeq + 1", () => {
        const result = applyEventBatch(initialRaceState(), [
            ev(0, "RACE_CREATED"),
            ev(1, "PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" }),
        ]);
        expect(result.appliedSeqs).toEqual([0, 1]);
        expect(result.skippedSeqs).toEqual([]);
        expect(result.state.id).toBe(RID);
        expect(result.state.lastSeq).toBe(1);
        expect(result.state.players.u1.displayName).toBe("A");
    });

    test("skips events already applied (idempotent under at-least-once delivery)", () => {
        const seed = applyEventBatch(initialRaceState(), [
            ev(0, "RACE_CREATED"),
            ev(1, "PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" }),
        ]).state;
        const result = applyEventBatch(seed, [
            ev(0, "RACE_CREATED"),
            ev(1, "PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" }),
            ev(2, "COUNTDOWN_STARTED"),
        ]);
        expect(result.appliedSeqs).toEqual([2]);
        expect(result.skippedSeqs).toEqual([0, 1]);
        expect(result.state.status).toBe("countdown");
    });

    test("sorts within-batch events by seq before applying", () => {
        const result = applyEventBatch(initialRaceState(), [
            ev(2, "COUNTDOWN_STARTED"),
            ev(0, "RACE_CREATED"),
            ev(1, "PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" }),
        ]);
        expect(result.appliedSeqs).toEqual([0, 1, 2]);
        expect(result.state.status).toBe("countdown");
        expect(result.state.lastSeq).toBe(2);
    });

    test("throws ProjectionGapError when next event is not lastSeq + 1", () => {
        let caught: unknown;
        try {
            applyEventBatch(initialRaceState(), [
                ev(0, "RACE_CREATED"),
                ev(2, "COUNTDOWN_STARTED"),
            ]);
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(ProjectionGapError);
        const gap = caught as ProjectionGapError;
        expect(gap.expectedSeq).toBe(1);
        expect(gap.receivedSeq).toBe(2);
        expect(gap.raceId).toBe(RID);
    });

    test("treats the empty batch as a no-op", () => {
        const seed = reduce(initialRaceState(), ev(0, "RACE_CREATED"));
        const result = applyEventBatch(seed, []);
        expect(result.state).toEqual(seed);
        expect(result.appliedSeqs).toEqual([]);
        expect(result.skippedSeqs).toEqual([]);
    });

    test("does not mutate input state", () => {
        const before = initialRaceState();
        const snapshot = JSON.stringify(before);
        applyEventBatch(before, [ev(0, "RACE_CREATED")]);
        expect(JSON.stringify(before)).toBe(snapshot);
    });
});
