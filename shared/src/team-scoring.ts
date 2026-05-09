import type { Team } from "./social";

export interface TeamPlayerResult {
    userId: string;
    teamId: string;
    wpm: number;
    accuracy: number;
    finishedAt: number;
}

export interface TeamScore {
    teamId: string;
    score: number;
    maxFinishedAt: number;
}

export function teamScore(rows: TeamPlayerResult[]): number {
    return rows.reduce((s, r) => s + r.wpm * r.accuracy, 0);
}

export function rankTeams(
    teams: Team[],
    results: TeamPlayerResult[],
): TeamScore[] {
    return teams
        .map((t) => {
            const rows = results.filter((r) => r.teamId === t.id);
            return {
                teamId: t.id,
                score: teamScore(rows),
                maxFinishedAt:
                    rows.length === 0
                        ? Number.POSITIVE_INFINITY
                        : rows.reduce((m, r) => Math.max(m, r.finishedAt), 0),
            };
        })
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.maxFinishedAt !== b.maxFinishedAt) {
                return a.maxFinishedAt - b.maxFinishedAt;
            }
            return a.teamId.localeCompare(b.teamId);
        });
}

export function pickWinner(
    teams: Team[],
    results: TeamPlayerResult[],
): TeamScore {
    const ranked = rankTeams(teams, results);
    if (ranked.length === 0) {
        throw new Error("rankTeams returned empty list");
    }
    return ranked[0]!;
}
