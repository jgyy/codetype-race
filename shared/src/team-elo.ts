import { TEAM_ELO_K, TEAM_SIZE_BONUS } from "./social";

export interface TeamMemberRating {
    userId: string;
    rating: number;
}

export interface TeamRatingDeltaInput {
    teamId: string;
    members: TeamMemberRating[];
}

export interface TeamRatingDelta {
    userId: string;
    teamId: string;
    delta: number;
    expected: number;
}

export function effectiveTeamRating(
    members: TeamMemberRating[],
    opponentSize: number,
): number {
    const mean =
        members.reduce((s, m) => s + m.rating, 0) /
        Math.max(1, members.length);
    const sizeDiff = opponentSize - members.length;
    const bonus = sizeDiff > 0 ? TEAM_SIZE_BONUS * sizeDiff : 0;
    return mean + bonus;
}

function expectedOutcome(rA: number, rB: number): number {
    return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

export function computeTeamRatingDeltas(
    winning: TeamRatingDeltaInput,
    losing: TeamRatingDeltaInput,
): TeamRatingDelta[] {
    const wEff = effectiveTeamRating(winning.members, losing.members.length);
    const lEff = effectiveTeamRating(losing.members, winning.members.length);
    const wExpected = expectedOutcome(wEff, lEff);
    const lExpected = 1 - wExpected;
    const wDelta = Math.round(TEAM_ELO_K * (1 - wExpected));
    const lDelta = -Math.round(TEAM_ELO_K * lExpected);
    return [
        ...winning.members.map((m) => ({
            userId: m.userId,
            teamId: winning.teamId,
            delta: wDelta,
            expected: wExpected,
        })),
        ...losing.members.map((m) => ({
            userId: m.userId,
            teamId: losing.teamId,
            delta: lDelta,
            expected: lExpected,
        })),
    ];
}
