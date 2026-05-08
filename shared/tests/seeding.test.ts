import { describe, expect, test } from "bun:test";
import {
    bracketSeedOrder,
    firstRoundIndex,
    isValidSize,
    rankEntrants,
    seedFirstRound,
    totalRounds,
    type Entrant,
} from "../src/seeding";

const E = (id: string, rating: number): Entrant => ({ userId: id, rating });

describe("isValidSize", () => {
    test("accepts 4/8/16/32/64 only", () => {
        for (const s of [4, 8, 16, 32, 64]) expect(isValidSize(s)).toBe(true);
        for (const s of [2, 6, 10, 12, 100]) expect(isValidSize(s)).toBe(false);
    });
});

describe("totalRounds / firstRoundIndex", () => {
    test("size 4 → 2 rounds, first round index 1", () => {
        expect(totalRounds(4)).toBe(2);
        expect(firstRoundIndex(4)).toBe(1);
    });
    test("size 16 → 4 rounds, first round index 3", () => {
        expect(totalRounds(16)).toBe(4);
        expect(firstRoundIndex(16)).toBe(3);
    });
});

describe("bracketSeedOrder", () => {
    test("size 4: [1,4,2,3]", () => {
        expect(bracketSeedOrder(4)).toEqual([1, 4, 2, 3]);
    });
    test("size 8: [1,8,4,5,2,7,3,6]", () => {
        expect(bracketSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    });
    test("size 16: top seed never meets seed 2 before final", () => {
        const order = bracketSeedOrder(16);
        expect(order.length).toBe(16);
        const half = order.length / 2;
        const top = order.indexOf(1);
        const second = order.indexOf(2);
        expect(Math.floor(top / half)).not.toBe(Math.floor(second / half));
    });
});

describe("rankEntrants", () => {
    test("higher rating ranks first; ties broken by userId asc", () => {
        const ranked = rankEntrants([
            E("c", 1500),
            E("a", 1500),
            E("b", 2000),
        ]);
        expect(ranked.map((e) => e.userId)).toEqual(["b", "a", "c"]);
    });
});

describe("seedFirstRound — golden determinism", () => {
    test("size 4 full bracket: seed 1 vs 4, seed 2 vs 3", () => {
        const matches = seedFirstRound(
            [E("p1", 2000), E("p2", 1800), E("p3", 1600), E("p4", 1400)],
            4,
        );
        expect(matches).toHaveLength(2);
        expect(matches[0].players.map((p) => p.userId)).toEqual(["p1", "p4"]);
        expect(matches[1].players.map((p) => p.userId)).toEqual(["p2", "p3"]);
        expect(matches.every((m) => !m.isBye)).toBe(true);
    });

    test("size 8 full bracket: positions 1v8, 4v5, 2v7, 3v6", () => {
        const ratings = [2400, 2200, 2000, 1800, 1600, 1400, 1200, 1000];
        const entrants = ratings.map((r, i) => E(`p${i + 1}`, r));
        const matches = seedFirstRound(entrants, 8);
        expect(matches).toHaveLength(4);
        const ids = matches.map((m) =>
            m.players.map((p) => p.userId).join("v"),
        );
        expect(ids).toEqual(["p1vp8", "p4vp5", "p2vp7", "p3vp6"]);
    });

    test("byes: 5 entrants in size 8 → top 3 seeds get bye", () => {
        const matches = seedFirstRound(
            [
                E("p1", 2000),
                E("p2", 1800),
                E("p3", 1600),
                E("p4", 1400),
                E("p5", 1200),
            ],
            8,
        );
        const byeMatches = matches.filter((m) => m.isBye);
        expect(byeMatches.length).toBe(3);
        // Highest seeds get the byes (their opponent is null)
        const filledSeedsAcrossByes = byeMatches
            .flatMap((m) => m.players)
            .filter((p) => p.userId !== null)
            .map((p) => p.seedRank!)
            .sort((a, b) => a - b);
        expect(filledSeedsAcrossByes).toEqual([1, 2, 3]);
    });

    test("identical inputs produce identical brackets (golden)", () => {
        const entrants = [
            E("alice", 1700),
            E("bob", 1700),
            E("carol", 1900),
            E("dan", 1500),
        ];
        const a = seedFirstRound(entrants, 4);
        const b = seedFirstRound([...entrants].reverse(), 4);
        expect(a).toEqual(b);
    });

    test("rejects too many entrants", () => {
        const entrants = Array.from({ length: 5 }, (_, i) =>
            E(`p${i}`, 1500),
        );
        expect(() => seedFirstRound(entrants, 4)).toThrow();
    });
});
