import { z } from "zod";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireTournamentsEnabled } from "../../src/AppError";
import { commandBus, WithdrawFromTournamentCommand } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireTournamentsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("missing tournament id");
    try {
        return await commandBus.dispatch(
            new WithdrawFromTournamentCommand({
                userId: ctx.userId,
                tournId: id,
            }),
        );
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
