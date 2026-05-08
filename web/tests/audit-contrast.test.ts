import { describe, expect, test } from "bun:test";
import { audit, contrastRatio, PAIRS, type Pair } from "../scripts/audit-contrast";

describe("contrastRatio", () => {
    test("white on black is 21:1", () => {
        expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
    });
    test("identity colors are 1:1", () => {
        expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
    });
    test("symmetric in argument order", () => {
        expect(contrastRatio("#0a0a0a", "#ededed")).toBeCloseTo(
            contrastRatio("#ededed", "#0a0a0a"),
            5,
        );
    });
});

describe("audit", () => {
    test("known-good pair passes", () => {
        const good: Pair[] = [{ name: "x", fg: "#ffffff", bg: "#000000" }];
        expect(audit(good).ok).toBe(true);
    });
    test("known-bad pair fails (gray on gray)", () => {
        const bad: Pair[] = [{ name: "x", fg: "#888888", bg: "#999999" }];
        const r = audit(bad);
        expect(r.ok).toBe(false);
        expect(r.failures).toHaveLength(1);
        expect(r.failures[0].ratio).toBeLessThan(4.5);
    });
    test("large/UI threshold of 3:1 distinguishes from 4.5:1", () => {
        const fg: Pair["fg"] = "#6a6a6a";
        const bg: Pair["bg"] = "#000000";
        expect(audit([{ name: "x", fg, bg }]).ok).toBe(false);
        expect(audit([{ name: "x", fg, bg, large: true }]).ok).toBe(true);
    });
    test("project PAIRS manifest passes (CI gate)", () => {
        const r = audit(PAIRS);
        if (!r.ok) {
            const summary = r.failures
                .map((f) => `${f.name}: ${f.ratio.toFixed(2)}:1`)
                .join("; ");
            throw new Error(`contrast failures: ${summary}`);
        }
        expect(r.ok).toBe(true);
    });
});
