import { describe, expect, test } from "bun:test";
import {
    buildCursorDigest,
    DEFAULT_DIGEST_BUCKET_MS,
    hasCursorDigest,
} from "../../src/services/CursorDigest";
import type {
    RaceEvent,
    RaceEventType,
} from "../../src/events/RaceEvent";

const RID = "11111111-1111-4111-8111-111111111111";
const CORR = "22222222-2222-4222-8222-222222222222";
const START_MS = Date.parse("2026-05-09T00:00:00.000Z");

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

describe("buildCursorDigest", () => {
    test("returns null with no events", () => {
        expect(buildCursorDigest([])).toBeNull();
    });

    test("returns null when RACE_STARTED is absent", () => {
        reset();
        const events = [
            ev("RACE_CREATED", null, {}, 0),
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 5, accuracy: 1 }, 100),
        ];
        expect(buildCursorDigest(events)).toBeNull();
    });

    test("downsamples 20 Hz cursor stream to 5 Hz (4× compression)", () => {
        reset();
        const events: RaceEvent[] = [ev("RACE_STARTED", null, {}, 0)];
        // 20 cursor events at 50 ms intervals over 1 second
        for (let i = 1; i <= 20; i++) {
            events.push(
                ev("CURSOR_PROGRESS", "u1", {
                    userId: "u1", charsTyped: i, accuracy: 1,
                }, i * 50),
            );
        }
        events.push(ev("RACE_FINISHED", null, {}, 1000));
        const d = buildCursorDigest(events);
        expect(d).not.toBeNull();
        expect(d!.bucketMs).toBe(DEFAULT_DIGEST_BUCKET_MS);
        // 1000 ms / 200 ms = 5 buckets (0, 200, 400, 600, 800) since the
        // last event at t=1000 lands in bucket 5
        expect(d!.perPlayer.u1.length).toBe(6);
        // Each bucket retains the highest charsTyped reading in the window
        const samples = d!.perPlayer.u1;
        expect(samples[0].t).toBe(0);
        expect(samples[1].t).toBe(200);
        // Latest event before t=200: i=4 (t=200) actually lands in bucket 1
        // i=3 (t=150) lands in bucket 0; i=4 (t=200) in bucket 1.
        expect(samples[1].charsTyped).toBeGreaterThanOrEqual(samples[0].charsTyped);
    });

    test("isolates samples per player", () => {
        reset();
        const events = [
            ev("RACE_STARTED", null, {}, 0),
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 5, accuracy: 1 }, 100),
            ev("CURSOR_PROGRESS", "u2", { userId: "u2", charsTyped: 8, accuracy: 1 }, 100),
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 12, accuracy: 1 }, 300),
            ev("RACE_FINISHED", null, {}, 1000),
        ];
        const d = buildCursorDigest(events)!;
        expect(Object.keys(d.perPlayer).sort()).toEqual(["u1", "u2"]);
        expect(d.perPlayer.u1).toHaveLength(2);
        expect(d.perPlayer.u2).toHaveLength(1);
    });

    test("samples within a bucket: keeps the latest reading", () => {
        reset();
        const events = [
            ev("RACE_STARTED", null, {}, 0),
            // Three readings in the same 0-200ms bucket
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 3, accuracy: 1 }, 50),
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 6, accuracy: 1 }, 100),
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 9, accuracy: 1 }, 150),
            ev("RACE_FINISHED", null, {}, 200),
        ];
        const d = buildCursorDigest(events)!;
        expect(d.perPlayer.u1).toHaveLength(1);
        expect(d.perPlayer.u1[0].charsTyped).toBe(9);
        expect(d.perPlayer.u1[0].t).toBe(0);
    });

    test("custom bucketMs is honoured (and validated)", () => {
        reset();
        const events = [
            ev("RACE_STARTED", null, {}, 0),
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 5, accuracy: 1 }, 50),
            ev("CURSOR_PROGRESS", "u1", { userId: "u1", charsTyped: 10, accuracy: 1 }, 150),
            ev("RACE_FINISHED", null, {}, 200),
        ];
        // bucketMs=1000 → both samples land in bucket 0 → only one survives
        const d = buildCursorDigest(events, { bucketMs: 1000 })!;
        expect(d.perPlayer.u1).toHaveLength(1);
        expect(d.perPlayer.u1[0].charsTyped).toBe(10);

        expect(() => buildCursorDigest(events, { bucketMs: 0 })).toThrow();
    });

    test("storage cap heuristic — 4-player 30s race produces ≤ ~600 samples", () => {
        reset();
        const events: RaceEvent[] = [ev("RACE_STARTED", null, {}, 0)];
        for (const u of ["u1", "u2", "u3", "u4"]) {
            for (let i = 1; i <= 600; i++) {
                events.push(
                    ev("CURSOR_PROGRESS", u, {
                        userId: u, charsTyped: i, accuracy: 1,
                    }, i * 50),
                );
            }
        }
        events.push(ev("RACE_FINISHED", null, {}, 30_000));
        const d = buildCursorDigest(events)!;
        const total = Object.values(d.perPlayer).reduce(
            (acc, list) => acc + list.length,
            0,
        );
        // 30 000 ms / 200 ms = 150 buckets per player × 4 players = 600
        expect(total).toBeLessThanOrEqual(610);
        expect(total).toBeGreaterThan(500);
    });
});

describe("hasCursorDigest", () => {
    test("returns true when at least one CURSOR_DIGEST event exists", () => {
        reset();
        const events = [
            ev("RACE_STARTED", null, {}, 0),
            ev("CURSOR_DIGEST", null, {}, 30_000),
        ];
        expect(hasCursorDigest(events)).toBe(true);
    });
    test("returns false when no digest exists", () => {
        reset();
        expect(hasCursorDigest([ev("RACE_STARTED", null, {}, 0)])).toBe(false);
    });
});
