import { describe, expect, test } from "bun:test";
import {
    PAGE_TOTAL_BUDGET_BYTES,
    PER_CHUNK_BUDGET_BYTES,
    evaluateBudget,
} from "../scripts/check-bundle";

describe("evaluateBudget (Phase 16.8)", () => {
    test("ok when total below page budget and no chunk over per-chunk budget", () => {
        const sizes = new Map([
            ["a.js", 50_000],
            ["b.js", 60_000],
        ]);
        const r = evaluateBudget(sizes);
        expect(r.ok).toBe(true);
        expect(r.total).toBe(110_000);
        expect(r.overChunks).toEqual([]);
    });

    test("not ok when total exceeds page budget", () => {
        const sizes = new Map([
            ["a.js", PAGE_TOTAL_BUDGET_BYTES],
            ["b.js", 1],
        ]);
        const r = evaluateBudget(sizes);
        expect(r.ok).toBe(false);
        expect(r.total).toBe(PAGE_TOTAL_BUDGET_BYTES + 1);
    });

    test("not ok when any single chunk exceeds per-chunk budget", () => {
        const sizes = new Map([
            ["fat.js", PER_CHUNK_BUDGET_BYTES + 1],
        ]);
        const r = evaluateBudget(sizes);
        expect(r.ok).toBe(false);
        expect(r.overChunks).toHaveLength(1);
        expect(r.overChunks[0].name).toBe("fat.js");
    });

    test("at exact budget edge is ok (<=)", () => {
        const sizes = new Map([["a.js", PAGE_TOTAL_BUDGET_BYTES]]);
        const r = evaluateBudget(sizes);
        expect(r.ok).toBe(true);
    });

    test("budgets are forced-visible constants, not env vars", () => {
        // Spec calls out 20 kB increments only, with reviewer approval —
        // the constants live in source so they show up in PR diff.
        expect(PAGE_TOTAL_BUDGET_BYTES).toBe(180 * 1024);
        expect(PER_CHUNK_BUDGET_BYTES).toBe(250 * 1024);
    });
});
