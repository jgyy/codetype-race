import { z } from "zod";
import { BracketResponseSchema } from "@codetype/shared/tournaments";
import { withHttp } from "../../src/middleware";
import {
    Errors,
    requireMod,
    requireTournamentsEnabled,
} from "../../src/AppError";
import { tournaments } from "../../src/repos/TournamentRepo";
import { matches } from "../../src/repos/MatchRepo";
import { seedTournament } from "../../src/orchestration/seedTournament";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireTournamentsEnabled();
    requireMod(ctx);
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("missing tournament id");

    const t = await tournaments.get(id);
    if (!t) throw Errors.NotFound("tournament");

    const moved = await tournaments.transitionStatus(
        id,
        "registering",
        "seeding",
    );
    if (!moved) {
        throw Errors.Conflict(`cannot seed from status=${t.status}`);
    }

    const written = await seedTournament({
        tournId: id,
        size: t.size,
        startsAt: t.startsAt,
        matches,
        tournaments,
    });

    await tournaments.transitionStatus(id, "seeding", "running");

    return BracketResponseSchema.parse({
        tournId: id,
        size: t.size,
        matches: written,
    });
});
