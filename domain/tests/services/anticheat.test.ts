import { describe, expect, test } from "bun:test";
import {
    evaluateRun,
    evaluateStats,
    isFlagged,
    maxSeverity,
    statsFromSamples,
    type KeystrokeSample,
} from "../../src/services/anticheat";

function makeSamples(intervals: number[], char = "a"): KeystrokeSample[] {
    let t = 0;
    return intervals.map((dt) => {
        t += dt;
        return { t, char };
    });
}

describe("evaluateStats — wire heuristics", () => {
    test("normal run produces no signals", () => {
        const sigs = evaluateStats({
            snippetLength: 200,
            durationMs: 60_000,
            charsTyped: 200,
        });
        expect(sigs).toEqual([]);
    });

    test("WPM_TOO_HIGH at 300 wpm", () => {
        const sigs = evaluateStats({
            snippetLength: 200,
            durationMs: 20_000,
            charsTyped: 200,
        });
        expect(sigs).toEqual([]);

        const fast = evaluateStats({
            snippetLength: 200,
            durationMs: 5_000,
            charsTyped: 200,
        });
        expect(fast.find((s) => s.code === "WPM_TOO_HIGH")).toBeDefined();
    });

    test("SUB_HUMAN_INTERVAL when ms/char too low", () => {
        const sigs = evaluateStats({
            snippetLength: 1000,
            durationMs: 5_000,
            charsTyped: 1000,
        });
        expect(sigs.find((s) => s.code === "SUB_HUMAN_INTERVAL")).toBeDefined();
    });

    test("LOW_VARIANCE only fires above the keystroke floor", () => {
        const small = evaluateStats({
            snippetLength: 50,
            durationMs: 30_000,
            charsTyped: 50,
            stddevIntervalMs: 1,
            totalKeystrokes: 30,
        });
        expect(small.find((s) => s.code === "LOW_VARIANCE")).toBeUndefined();

        const big = evaluateStats({
            snippetLength: 200,
            durationMs: 60_000,
            charsTyped: 200,
            stddevIntervalMs: 1,
            totalKeystrokes: 200,
        });
        expect(big.find((s) => s.code === "LOW_VARIANCE")).toBeDefined();
    });

    test("PASTE_SUSPECTED on a single-frame burst", () => {
        const sigs = evaluateStats({
            snippetLength: 100,
            durationMs: 30_000,
            charsTyped: 100,
            maxPosAdvance: 12,
        });
        expect(sigs.find((s) => s.code === "PASTE_SUSPECTED")).toBeDefined();
    });
});

describe("statsFromSamples", () => {
    test("computes mean/stddev/maxgap from a uniform stream", () => {
        const stats = statsFromSamples(makeSamples(Array(100).fill(50)), 100);
        expect(stats.meanIntervalMs).toBeCloseTo(50, 0);
        expect(stats.stddevIntervalMs).toBeCloseTo(0, 5);
        expect(stats.maxIntervalGapMs).toBe(50);
        expect(stats.totalKeystrokes).toBe(100);
    });
});

describe("evaluateRun — fixtures", () => {
    test("synthetic bot (constant 40ms) flags WPM_TOO_HIGH and LOW_VARIANCE", () => {
        const samples = makeSamples(Array(200).fill(40));
        const sigs = evaluateRun(samples, 200);
        const codes = sigs.map((s) => s.code);
        expect(codes).toContain("WPM_TOO_HIGH");
        expect(codes).toContain("LOW_VARIANCE");
    });

    test("fast human (mean 100ms, lots of jitter) does NOT flag", () => {
        const intervals: number[] = [];
        let seed = 0;
        for (let i = 0; i < 200; i++) {
            seed = (seed * 9301 + 49297) % 233280;
            intervals.push(60 + (seed % 100));
        }
        const samples = makeSamples(intervals);
        const sigs = evaluateRun(samples, 200);
        expect(isFlagged(sigs)).toBe(false);
    });

    test("paste burst flags PASTE_SUSPECTED", () => {
        const burst = Array(20).fill(2);
        const rest = Array(50).fill(120);
        const samples = makeSamples([...burst, ...rest]);
        const sigs = evaluateRun(samples, 70);
        expect(sigs.find((s) => s.code === "PASTE_SUSPECTED")).toBeDefined();
    });
});

describe("isFlagged / maxSeverity", () => {
    test("only high severity flags the run", () => {
        expect(
            isFlagged([
                { code: "X", severity: "medium", detail: "" },
                { code: "Y", severity: "low", detail: "" },
            ]),
        ).toBe(false);
        expect(
            isFlagged([{ code: "X", severity: "high", detail: "" }]),
        ).toBe(true);
    });
    test("maxSeverity returns the highest", () => {
        expect(
            maxSeverity([
                { code: "X", severity: "low", detail: "" },
                { code: "Y", severity: "medium", detail: "" },
            ]),
        ).toBe("medium");
    });
});
