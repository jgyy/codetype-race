import { z } from "zod";
import {
    seedFirstRound,
    firstRoundIndex,
    isValidSize,
    type Entrant,
} from "@codetype/shared/seeding";
import {
    BracketResponseSchema,
    type TournamentMatch,
} from "@codetype/shared/tournaments";
import { withHttp } from "../../src/middleware";
import {
    Errors,
    requireMod,
    requireTournamentsEnabled,
} from "../../src/AppError";
import { tournaments } from "../../src/repos/TournamentRepo";
import { matches } from "../../src/repos/MatchRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireTournamentsEnabled();
    requireMod(ctx);
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("missing tournament id");

    const t = await tournaments.get(id);
    if (!t) throw Errors.NotFound("tournament");
    if (!isValidSize(t.size)) throw Errors.Internal(`invalid size ${t.size}`);

    const moved = await tournaments.transitionStatus(
        id,
        "registering",
        "seeding",
    );
    if (!moved) {
        throw Errors.Conflict(`cannot seed from status=${t.status}`);
    }

    const entrants = await tournaments.listEntrants(id);
    const seedInputs: Entrant[] = entrants.map((e) => ({
        userId: e.userId,
        rating: e.snapshotRating,
    }));

    const firstRound = seedFirstRound(seedInputs, t.size);
    const round = firstRoundIndex(t.size);
    const now = new Date().toISOString();

    // Persist first-round matches; auto-resolve byes immediately.
    const written: TournamentMatch[] = [];
    for (const m of firstRound) {
        const status = m.isBye ? "bye" : "pending";
        const players: [string | null, string | null] = [
            m.players[0].userId,
            m.players[1].userId,
        ];
        const winnerId = m.isBye
            ? (m.players[0].userId ?? m.players[1].userId ?? null)
            : null;
        const match: TournamentMatch = {
            tournId: id,
            round,
            slot: m.slot,
            status,
            players,
            winnerId,
            roomId: null,
            scheduledAt: t.startsAt,
            completedAt: m.isBye ? now : null,
            flagged: false,
        };
        await matches.put(match);
        written.push(match);
    }

    // Persist seed ranks back to entrants for display.
    for (const m of firstRound) {
        for (const p of m.players) {
            if (p.userId && p.seedRank !== null) {
                await tournaments.setEntrantSeed(id, p.userId, p.seedRank);
            }
        }
    }

    await tournaments.transitionStatus(id, "seeding", "running");

    return BracketResponseSchema.parse({
        tournId: id,
        size: t.size,
        matches: written,
    });
});
