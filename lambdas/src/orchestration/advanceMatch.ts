import type { TournamentMatch } from "@codetype/shared/tournaments";
import type { MatchRepo } from "../repos/MatchRepo";
import type { TournamentRepo } from "../repos/TournamentRepo";

/**
 * Advance a finished bracket match to its parent. Idempotent under
 * concurrent calls because all state changes go through CAS-guarded DDB
 * operations:
 *   - child match transitions live -> done only if status==live and
 *     winnerId matches (TransactWriteItems in MatchRepo.advanceWinner)
 *   - parent slot is set only if currently null
 *
 * Returns one of:
 *   - { advanced: true, parent }: caller should schedule the parent room
 *   - { advanced: true, finished: true }: tournament is over (round 0)
 *   - { advanced: false }: a concurrent caller already advanced this match
 */
export interface AdvanceResult {
    advanced: boolean;
    finished?: boolean;
    parent?: TournamentMatch;
    winnerId?: string;
}

export async function advanceMatch(args: {
    tournId: string;
    round: number;
    slot: number;
    winnerId: string;
    matches: MatchRepo;
    tournaments: TournamentRepo;
    now?: () => Date;
}): Promise<AdvanceResult> {
    const now = (args.now ?? (() => new Date()))().toISOString();

    const child = await args.matches.get(args.tournId, args.round, args.slot);
    if (!child) return { advanced: false };
    if (child.status === "done") return { advanced: false };
    if (child.status !== "live" && child.status !== "bye") {
        return { advanced: false };
    }

    if (args.round === 0) {
        // Final: just transition status + flag tournament finished.
        const ok = await args.matches.transitionStatus(
            args.tournId,
            0,
            args.slot,
            child.status,
            "done",
            { winnerId: args.winnerId, completedAt: now },
        );
        if (!ok) return { advanced: false };
        await args.tournaments.transitionStatus(
            args.tournId,
            "running",
            "finished",
            { winnerId: args.winnerId },
        );
        return {
            advanced: true,
            finished: true,
            winnerId: args.winnerId,
        };
    }

    const parentRound = args.round - 1;
    const parentSlot = Math.floor(args.slot / 2);
    const parentSlotIndex = (args.slot % 2) as 0 | 1;

    const ok = await args.matches.advanceWinner({
        tournId: args.tournId,
        childRound: args.round,
        childSlot: args.slot,
        winnerId: args.winnerId,
        parentRound,
        parentSlot,
        parentSlotIndex,
        completedAt: now,
    });
    if (!ok) return { advanced: false };

    const parent = await args.matches.get(
        args.tournId,
        parentRound,
        parentSlot,
    );
    return { advanced: true, parent: parent ?? undefined, winnerId: args.winnerId };
}
