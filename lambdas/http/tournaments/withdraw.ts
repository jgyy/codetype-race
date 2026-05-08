import { z } from "zod";
import { withHttp } from "../../src/middleware";
import {
    Errors,
    requireTournamentsEnabled,
} from "../../src/AppError";
import { tournaments } from "../../src/repos/TournamentRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireTournamentsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("missing tournament id");

    const t = await tournaments.get(id);
    if (!t) throw Errors.NotFound("tournament");
    if (t.status !== "registering") {
        throw Errors.Conflict("can only withdraw before seeding");
    }

    await tournaments.removeEntrant(id, ctx.userId);
    return { ok: true } as const;
});
