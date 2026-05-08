import {
    firstRoundIndex,
    isValidSize,
    seedFirstRound,
    type Entrant,
} from "@codetype/shared/seeding";
import type { TournamentMatch } from "@codetype/shared/tournaments";
import type { MatchRepo } from "../repos/MatchRepo";
import type { TournamentRepo } from "../repos/TournamentRepo";

/**
 * Seed a tournament: write first-round matches with byes auto-resolved
 * and persist seedRanks back to entrants. Pure of HTTP/cron concerns so
 * both the seed handler and the advance-tournaments cron share it.
 */
export async function seedTournament(args: {
    tournId: string;
    size: number;
    startsAt: string;
    matches: MatchRepo;
    tournaments: TournamentRepo;
    now?: () => Date;
}): Promise<TournamentMatch[]> {
    if (!isValidSize(args.size)) {
        throw new Error(`invalid tournament size ${args.size}`);
    }
    const now = (args.now ?? (() => new Date()))().toISOString();
    const entrants = await args.tournaments.listEntrants(args.tournId);
    const inputs: Entrant[] = entrants.map((e) => ({
        userId: e.userId,
        rating: e.snapshotRating,
    }));
    const round = firstRoundIndex(args.size);
    const firstRound = seedFirstRound(inputs, args.size);

    const written: TournamentMatch[] = [];
    for (const m of firstRound) {
        const isBye = m.isBye;
        const players: [string | null, string | null] = [
            m.players[0].userId,
            m.players[1].userId,
        ];
        const winnerId = isBye
            ? (m.players[0].userId ?? m.players[1].userId ?? null)
            : null;
        const match: TournamentMatch = {
            tournId: args.tournId,
            round,
            slot: m.slot,
            status: isBye ? "bye" : "pending",
            players,
            winnerId,
            roomId: null,
            scheduledAt: args.startsAt,
            completedAt: isBye ? now : null,
            flagged: false,
        };
        await args.matches.put(match);
        written.push(match);
    }

    for (const m of firstRound) {
        for (const p of m.players) {
            if (p.userId && p.seedRank !== null) {
                await args.tournaments.setEntrantSeed(
                    args.tournId,
                    p.userId,
                    p.seedRank,
                );
            }
        }
    }
    return written;
}
