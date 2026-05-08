import { z } from "zod";
import { BracketResponseSchema } from "@codetype/shared/tournaments";
import { withHttp } from "../../src/middleware";
import { Errors } from "../../src/AppError";
import { tournaments } from "../../src/repos/TournamentRepo";
import { matches } from "../../src/repos/MatchRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("missing tournament id");
    const t = await tournaments.get(id);
    if (!t) throw Errors.NotFound("tournament");
    const all = await matches.listAll(id);
    return BracketResponseSchema.parse({
        tournId: id,
        size: t.size,
        matches: all,
    });
});
