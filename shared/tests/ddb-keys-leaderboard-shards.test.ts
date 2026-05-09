import { describe, expect, test } from "bun:test";
import {
    leaderboardGlobalShardPK,
    leaderboardLangShardPK,
    leaderboardShardCount,
    leaderboardShardIndex,
} from "../src/ddb-keys";

describe("leaderboard shard keys (Phase 16.1)", () => {
    test("shard count is 16", () => {
        expect(leaderboardShardCount).toBe(16);
    });

    test("shard index is in range and deterministic", () => {
        for (const id of ["u1", "user-abc", "USER#xyz", ""]) {
            const a = leaderboardShardIndex(id);
            const b = leaderboardShardIndex(id);
            expect(a).toBe(b);
            expect(a).toBeGreaterThanOrEqual(0);
            expect(a).toBeLessThan(leaderboardShardCount);
            expect(Number.isInteger(a)).toBe(true);
        }
    });

    test("shard index distributes a synthetic user set across all 16 shards", () => {
        const seen = new Set<number>();
        for (let i = 0; i < 1000; i++) {
            seen.add(leaderboardShardIndex(`user-${i}`));
        }
        expect(seen.size).toBe(leaderboardShardCount);
    });

    test("PKs include zero-padded 2-digit shard suffix", () => {
        expect(leaderboardGlobalShardPK(0)).toBe(
            "LEADERBOARD#GLOBAL#SHARD#00",
        );
        expect(leaderboardGlobalShardPK(7)).toBe(
            "LEADERBOARD#GLOBAL#SHARD#07",
        );
        expect(leaderboardGlobalShardPK(15)).toBe(
            "LEADERBOARD#GLOBAL#SHARD#15",
        );
        expect(leaderboardLangShardPK("ts", 3)).toBe(
            "LEADERBOARD#LANG#ts#SHARD#03",
        );
    });
});
