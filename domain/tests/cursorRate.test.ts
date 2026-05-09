import { describe, expect, test } from "bun:test";
import {
    cursorIntervalMs,
    cursorRateHz,
    type RoomKind,
} from "../src/services/cursorRate";

const cases: Array<{
    label: string;
    in: { kind: RoomKind; playerCount: number; lite?: boolean };
    expected: number;
}> = [
    { label: "practice room is silent", in: { kind: "practice", playerCount: 1 }, expected: 0 },
    { label: "practice with bots is still silent", in: { kind: "practice", playerCount: 4 }, expected: 0 },
    { label: "solo room is silent", in: { kind: "solo", playerCount: 1 }, expected: 0 },
    { label: "race with one player is silent", in: { kind: "race", playerCount: 1 }, expected: 0 },
    { label: "race with 2 players ticks at 10 Hz", in: { kind: "race", playerCount: 2 }, expected: 10 },
    { label: "race with 3 players ticks at 15 Hz", in: { kind: "race", playerCount: 3 }, expected: 15 },
    { label: "race with 4 players ticks at 15 Hz", in: { kind: "race", playerCount: 4 }, expected: 15 },
    { label: "race with 5 players ticks at 20 Hz", in: { kind: "race", playerCount: 5 }, expected: 20 },
    { label: "race with 8 players ticks at 20 Hz", in: { kind: "race", playerCount: 8 }, expected: 20 },
    { label: "tournament with 4 players ticks at 15 Hz", in: { kind: "tournament", playerCount: 4 }, expected: 15 },
    { label: "lite client caps at 5 Hz on a 20 Hz room", in: { kind: "race", playerCount: 8, lite: true }, expected: 5 },
    { label: "lite client at 10 Hz cap to 5", in: { kind: "race", playerCount: 2, lite: true }, expected: 5 },
    { label: "lite practice still silent", in: { kind: "practice", playerCount: 4, lite: true }, expected: 0 },
];

describe("cursorRateHz (Phase 16.5)", () => {
    for (const c of cases) {
        test(c.label, () => {
            expect(cursorRateHz(c.in)).toBe(c.expected);
        });
    }
});

describe("cursorIntervalMs (Phase 16.5)", () => {
    test("rate 0 produces null (caller should suppress flushes)", () => {
        expect(cursorIntervalMs(0)).toBeNull();
        expect(cursorIntervalMs(-1)).toBeNull();
    });
    test("10 Hz -> 100 ms", () => expect(cursorIntervalMs(10)).toBe(100));
    test("20 Hz -> 50 ms", () => expect(cursorIntervalMs(20)).toBe(50));
    test("5 Hz -> 200 ms", () => expect(cursorIntervalMs(5)).toBe(200));
    test("15 Hz -> 67 ms (rounded)", () => expect(cursorIntervalMs(15)).toBe(67));
});
