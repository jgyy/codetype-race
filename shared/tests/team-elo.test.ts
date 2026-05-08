import { describe, expect, test } from "bun:test";
import {
    computeTeamRatingDeltas,
    effectiveTeamRating,
} from "../src/team-elo";
import { TEAM_SIZE_BONUS } from "../src/social";

describe("effectiveTeamRating", () => {
    test("equal sizes: no bonus", () => {
        const r = effectiveTeamRating(
            [
                { userId: "a", rating: 1000 },
                { userId: "b", rating: 1100 },
            ],
            2,
        );
        expect(r).toBe(1050);
    });

    test("smaller team gets size_diff bonus", () => {
        const r = effectiveTeamRating([{ userId: "a", rating: 1000 }], 2);
        expect(r).toBe(1000 + TEAM_SIZE_BONUS);
    });

    test("larger team does not get a penalty", () => {
        const r = effectiveTeamRating(
            [
                { userId: "a", rating: 1000 },
                { userId: "b", rating: 1000 },
            ],
            1,
        );
        expect(r).toBe(1000);
    });
});

describe("computeTeamRatingDeltas", () => {
    test("equal teams, winner gets ~+12, loser ~-12 (K=24)", () => {
        const deltas = computeTeamRatingDeltas(
            {
                teamId: "A",
                members: [{ userId: "a", rating: 1000 }],
            },
            {
                teamId: "B",
                members: [{ userId: "b", rating: 1000 }],
            },
        );
        const a = deltas.find((d) => d.userId === "a")!;
        const b = deltas.find((d) => d.userId === "b")!;
        expect(a.delta).toBe(12);
        expect(b.delta).toBe(-12);
    });

    test("favoured team gets smaller delta on a win", () => {
        const heavy = computeTeamRatingDeltas(
            { teamId: "A", members: [{ userId: "a", rating: 1400 }] },
            { teamId: "B", members: [{ userId: "b", rating: 1000 }] },
        );
        const aWin = heavy.find((d) => d.userId === "a")!.delta;
        const fair = computeTeamRatingDeltas(
            { teamId: "A", members: [{ userId: "a", rating: 1000 }] },
            { teamId: "B", members: [{ userId: "b", rating: 1000 }] },
        );
        const aFairWin = fair.find((d) => d.userId === "a")!.delta;
        expect(aWin).toBeLessThan(aFairWin);
    });

    test("size mismatch shifts expected outcome toward smaller team", () => {
        // 1v2 with all-equal individual ratings: smaller team's expected
        // outcome should be > 0.5 thanks to TEAM_SIZE_BONUS, so when the
        // larger team wins anyway the delta should be larger than fair.
        const upset = computeTeamRatingDeltas(
            {
                teamId: "B",
                members: [
                    { userId: "b1", rating: 1000 },
                    { userId: "b2", rating: 1000 },
                ],
            },
            { teamId: "A", members: [{ userId: "a", rating: 1000 }] },
        );
        const winnerDelta = upset.find((d) => d.userId === "b1")!.delta;
        expect(winnerDelta).toBeGreaterThan(12);
    });

    test("each member of the winning team gets the same delta", () => {
        const deltas = computeTeamRatingDeltas(
            {
                teamId: "A",
                members: [
                    { userId: "a1", rating: 1000 },
                    { userId: "a2", rating: 1500 },
                ],
            },
            {
                teamId: "B",
                members: [
                    { userId: "b1", rating: 1100 },
                    { userId: "b2", rating: 1200 },
                ],
            },
        );
        const a1 = deltas.find((d) => d.userId === "a1")!.delta;
        const a2 = deltas.find((d) => d.userId === "a2")!.delta;
        expect(a1).toBe(a2);
    });
});
