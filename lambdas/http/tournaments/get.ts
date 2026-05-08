import { z } from "zod";
import { GetTournamentResponseSchema } from "@codetype/shared/tournaments";
import { withHttp } from "../../src/middleware";
import { Errors } from "../../src/AppError";
import { tournaments } from "../../src/repos/TournamentRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("missing tournament id");
    const t = await tournaments.get(id);
    if (!t) throw Errors.NotFound("tournament");
    const entrants = await tournaments.listEntrants(id);
    return GetTournamentResponseSchema.parse({
        ...t,
        entrantCount: entrants.length,
    });
});
