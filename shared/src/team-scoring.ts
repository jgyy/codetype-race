import type { Team } from "./social";

// Shared input shape: one row per finished racer.
export interface TeamPlayerResult {
    userId: string;
    teamId: string;
    wpm: number;
    accuracy: number; // 0..1
    finishedAt: number;
}

export interface TeamScore {
    teamId: string;
    score: number;
    /** Latest finish time among the team's players (used for tiebreak). */
    maxFinishedAt: number;
}

export function teamScore(rows: TeamPlayerResult[]): number {
    return rows.reduce((s, r) => s + r.wpm * r.accuracy, 0);
}

/**
 * Score every team and pick the winner. Tiebreak per spec line 200:
 * the team whose *latest* finisher crossed earliest wins. If two teams
 * still tie after the tiebreak, the team with the lower id ('A'<'B'…)
 * wins — deterministic and impossible to grief.
 */
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
