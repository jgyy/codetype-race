import { describe, expect, test } from "bun:test";
import { applyDecay, DEFAULT_DECAY_FACTOR, DEFAULT_DECAY_TARGET } from "../src/decay";

describe("applyDecay", () => {
    test("rating at target is unchanged", () => {
        expect(applyDecay(1200)).toBe(1200);
    });

    test("low rating moves up toward 1200", () => {
        // 800 + 0.25 * (1200 - 800) = 800 + 100 = 900
        expect(applyDecay(800)).toBe(900);
    });

    test("high rating decays toward 1200", () => {
        // 1900 + 0.25 * (1200 - 1900) = 1900 - 175 = 1725
        expect(applyDecay(1900)).toBe(1725);
        // 2400 + 0.25 * (1200 - 2400) = 2400 - 300 = 2100
        expect(applyDecay(2400)).toBe(2100);
    });

    test("custom factor and target", () => {
        // factor=0 → no change
        expect(applyDecay(1500, 0)).toBe(1500);
        // factor=1 → snaps to target
        expect(applyDecay(1500, 1)).toBe(DEFAULT_DECAY_TARGET);
        expect(applyDecay(1500, 1, 1000)).toBe(1000);
    });

    test("rejects out-of-range factor", () => {
        expect(() => applyDecay(1500, -0.1)).toThrow();
        expect(() => applyDecay(1500, 1.1)).toThrow();
    });

    test("default factor matches spec", () => {
        expect(DEFAULT_DECAY_FACTOR).toBe(0.25);
        expect(DEFAULT_DECAY_TARGET).toBe(1200);
    });
});
