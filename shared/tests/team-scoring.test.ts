import { describe, expect, test } from "bun:test";
import { pickWinner, rankTeams, teamScore } from "../src/team-scoring";
import type { Team } from "../src/social";

const teamA: Team = {
    id: "A",
    name: "alpha",
    color: "#ff0000",
    members: ["a1", "a2"],
};
const teamB: Team = {
    id: "B",
    name: "beta",
    color: "#00ff00",
    members: ["b1", "b2"],
};

describe("teamScore", () => {
    test("sums wpm * accuracy across rows", () => {
        const score = teamScore([
            { userId: "a1", teamId: "A", wpm: 80, accuracy: 0.95, finishedAt: 1 },
            { userId: "a2", teamId: "A", wpm: 60, accuracy: 0.9, finishedAt: 2 },
        ]);
        expect(score).toBeCloseTo(80 * 0.95 + 60 * 0.9);
    });
});

describe("rankTeams", () => {
    test("higher score wins", () => {
        const ranked = rankTeams([teamA, teamB], [
            { userId: "a1", teamId: "A", wpm: 80, accuracy: 1, finishedAt: 100 },
            { userId: "a2", teamId: "A", wpm: 80, accuracy: 1, finishedAt: 110 },
            { userId: "b1", teamId: "B", wpm: 50, accuracy: 1, finishedAt: 90 },
            { userId: "b2", teamId: "B", wpm: 50, accuracy: 1, finishedAt: 95 },
        ]);
        expect(ranked[0]!.teamId).toBe("A");
    });

    test("equal score: lower max(finishedAt) wins", () => {
        const ranked = rankTeams([teamA, teamB], [
            { userId: "a1", teamId: "A", wpm: 70, accuracy: 1, finishedAt: 100 },
            { userId: "a2", teamId: "A", wpm: 70, accuracy: 1, finishedAt: 200 },
            { userId: "b1", teamId: "B", wpm: 70, accuracy: 1, finishedAt: 150 },
            { userId: "b2", teamId: "B", wpm: 70, accuracy: 1, finishedAt: 160 },
        ]);
        expect(ranked[0]!.teamId).toBe("B");
    });

    test("perfectly tied: lower team id wins (deterministic)", () => {
        const ranked = rankTeams([teamA, teamB], [
            { userId: "a1", teamId: "A", wpm: 70, accuracy: 1, finishedAt: 100 },
            { userId: "b1", teamId: "B", wpm: 70, accuracy: 1, finishedAt: 100 },
        ]);
        expect(ranked[0]!.teamId).toBe("A");
    });

    test("team with no finishers ranks last", () => {
        const ranked = rankTeams([teamA, teamB], [
            { userId: "a1", teamId: "A", wpm: 1, accuracy: 1, finishedAt: 100 },
        ]);
        expect(ranked[0]!.teamId).toBe("A");
        expect(ranked[1]!.teamId).toBe("B");
    });
});

describe("pickWinner", () => {
    test("returns top of rankTeams", () => {
        const winner = pickWinner([teamA, teamB], [
            { userId: "a1", teamId: "A", wpm: 100, accuracy: 1, finishedAt: 1 },
            { userId: "b1", teamId: "B", wpm: 50, accuracy: 1, finishedAt: 1 },
        ]);
        expect(winner.teamId).toBe("A");
    });
});
