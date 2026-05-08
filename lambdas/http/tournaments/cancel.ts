import { z } from "zod";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import {
    AppError,
    Errors,
    requireMod,
    requireTournamentsEnabled,
} from "../../src/AppError";
import { CancelTournamentCommand, commandBus } from "../_container";

export const handler = withHttp(z.object({}).passthrough(), async (_input, ctx) => {
    requireTournamentsEnabled();
    requireMod(ctx);
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("missing tournament id");
    try {
        return await commandBus.dispatch(
            new CancelTournamentCommand({ tournId: id }),
        );
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
