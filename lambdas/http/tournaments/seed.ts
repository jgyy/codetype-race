import { z } from "zod";
import { BracketResponseSchema } from "@codetype/shared/tournaments";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import {
    AppError,
    Errors,
    requireMod,
    requireTournamentsEnabled,
} from "../../src/AppError";
import { commandBus, SeedTournamentCommand } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireTournamentsEnabled();
    requireMod(ctx);
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("missing tournament id");
    try {
        const result = await commandBus.dispatch(
            new SeedTournamentCommand({ tournId: id }),
        );
        return BracketResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
