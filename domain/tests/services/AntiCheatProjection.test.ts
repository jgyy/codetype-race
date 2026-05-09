import { describe, expect, test } from "bun:test";
import {
    aggregateForPlayer,
    evaluatePlayer,
    emptyPlayerAcStats,
} from "../../src/services/AntiCheatProjection";
import type { RaceEvent, RaceEventType } from "../../src/events/RaceEvent";

const RID = "11111111-1111-4111-8111-111111111111";
const CORR = "22222222-2222-4222-8222-222222222222";

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

describe("aggregateForPlayer", () => {
    test("captures startedAt + final stats from a normal run", () => {
        reset();
        const events = [
            ev("RACE_CREATED"),
            ev("PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" }),
            ev("RACE_STARTED", null, {}, "2026-05-09T00:00:00.000Z"),
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 10, errors: 0, accuracy: 1 }),
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 30, errors: 0, accuracy: 1 }),
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 50, errors: 0, accuracy: 1 }),
            ev("PLAYER_FINISHED", "u1", {
                finishedAt: "2026-05-09T00:00:30.000Z",
                charsTyped: 50, accuracy: 0.98, wpm: 50,
            }),
        ];
        const s = aggregateForPlayer(events, "u1");
        expect(s.raceId).toBe(RID);
        expect(s.startedAt).toBe("2026-05-09T00:00:00.000Z");
        expect(s.finishedAt).toBe("2026-05-09T00:00:30.000Z");
        expect(s.finalCharsTyped).toBe(50);
        expect(s.finalAccuracy).toBeCloseTo(0.98);
        expect(s.cursorEventCount).toBe(3);
        expect(s.maxPosAdvance).toBe(20); // 30 -> 50 = +20, but 0 -> 10 = +10, 10 -> 30 = +20
    });

    test("ignores cursor + finish events for other players", () => {
        reset();
        const events = [
            ev("RACE_STARTED"),
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 100 }),
            ev("CURSOR_PROGRESS", "u2", { userId: "u2", charsTyped: 200 }),
            ev("PLAYER_FINISHED", "u2", { finishedAt: "2026-05-09T00:00:01.000Z", charsTyped: 200, accuracy: 1, wpm: 0 }),
        ];
        const s = aggregateForPlayer(events, "u1");
        expect(s.cursorEventCount).toBe(1);
        expect(s.lastCharsTyped).toBe(100);
        expect(s.finishedAt).toBeNull();
    });

    test("empty event list returns empty stats", () => {
        const s = aggregateForPlayer([], "u1");
        expect(s).toEqual(emptyPlayerAcStats("", "u1"));
    });

    test("paste shape: a single jump from 0 -> 100 is captured as maxPosAdvance=100", () => {
        reset();
        const events = [
            ev("RACE_STARTED"),
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 100 }),
        ];
        const s = aggregateForPlayer(events, "u1");
        expect(s.maxPosAdvance).toBe(100);
    });
});

describe("evaluatePlayer", () => {
    test("returns no signals if player hasn't finished", () => {
        const s = emptyPlayerAcStats(RID, "u1");
        s.startedAt = "2026-05-09T00:00:00.000Z";
        s.cursorEventCount = 60;
        expect(evaluatePlayer(s)).toEqual([]);
    });

    test("returns no signals for a normal completion", () => {
        const s = emptyPlayerAcStats(RID, "u1");
        s.startedAt = "2026-05-09T00:00:00.000Z";
        s.finishedAt = "2026-05-09T00:00:30.000Z";
        s.finalCharsTyped = 200;
        s.maxPosAdvance = 4;
        s.cursorEventCount = 100;
        const signals = evaluatePlayer(s, { snippetLength: 200 });
        expect(signals).toEqual([]);
    });

    test("flags WPM_TOO_HIGH for unrealistic typing speed", () => {
        const s = emptyPlayerAcStats(RID, "u1");
        s.startedAt = "2026-05-09T00:00:00.000Z";
        s.finishedAt = "2026-05-09T00:00:01.000Z"; // 1 second
        s.finalCharsTyped = 1000; // 1000 chars / 5 / (1/60) = 12000 wpm
        const signals = evaluatePlayer(s, { snippetLength: 1000 });
        expect(signals.some((sg) => sg.code === "WPM_TOO_HIGH")).toBe(true);
    });

    test("flags PASTE_SUSPECTED on large single-event advance", () => {
        const s = emptyPlayerAcStats(RID, "u1");
        s.startedAt = "2026-05-09T00:00:00.000Z";
        s.finishedAt = "2026-05-09T00:00:30.000Z";
        s.finalCharsTyped = 100;
        s.maxPosAdvance = 50;
        const signals = evaluatePlayer(s, { snippetLength: 100 });
        expect(signals.some((sg) => sg.code === "PASTE_SUSPECTED")).toBe(true);
    });
});
