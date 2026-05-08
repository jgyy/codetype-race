import { describe, expect, test } from "bun:test";
import {
    levelFor,
    MAX_LEVEL,
    xpForLevel,
} from "../../src/progression/xp";

describe("xpForLevel", () => {
    test("level 1 = 100", () => {
        expect(xpForLevel(1)).toBe(100);
    });
    test("level 10 ≈ 100 * 10^1.5", () => {
        expect(xpForLevel(10)).toBe(Math.floor(100 * Math.pow(10, 1.5)));
    });
    test("monotonic increasing", () => {
        for (let lv = 1; lv < MAX_LEVEL; lv++) {
            expect(xpForLevel(lv + 1)).toBeGreaterThan(xpForLevel(lv));
        }
    });
});

describe("levelFor", () => {
    test("0 xp → level 1", () => {
        const r = levelFor(0);
        expect(r.level).toBe(1);
        expect(r.currentLevelXp).toBe(0);
        expect(r.nextLevelXp).toBe(100);
    });

    test("99 xp → still level 1", () => {
        expect(levelFor(99).level).toBe(1);
    });

    test("100 xp → level 2 with 0 progress", () => {
        const r = levelFor(100);
        expect(r.level).toBe(2);
        expect(r.currentLevelXp).toBe(0);
    });

    test("crossing into level 2 increments currentLevelXp", () => {
        const r = levelFor(150);
        expect(r.level).toBe(2);
        expect(r.currentLevelXp).toBe(50);
    });

    test("clamps at MAX_LEVEL", () => {
        const r = levelFor(10_000_000);
        expect(r.level).toBe(MAX_LEVEL);
        expect(r.nextLevelXp).toBe(0);
    });

    test("level is monotonic in totalXp (1000 random samples)", () => {
        let prevLevel = 1;
        for (let xp = 0; xp <= 1_000_000; xp += 997) {
            const lv = levelFor(xp).level;
            expect(lv).toBeGreaterThanOrEqual(prevLevel);
            prevLevel = lv;
        }
    });

    test("currentLevelXp < nextLevelXp at every level below cap", () => {
        for (let lv = 1; lv < MAX_LEVEL; lv++) {
            const justEntered = (() => {
                let cum = 0;
                for (let i = 1; i < lv; i++) cum += xpForLevel(i);
                return cum;
            })();
            const r = levelFor(justEntered);
            expect(r.level).toBe(lv);
            expect(r.currentLevelXp).toBeLessThan(r.nextLevelXp);
        }
    });

    test("negative xp clamped to 0", () => {
        expect(levelFor(-1).level).toBe(1);
    });
});
