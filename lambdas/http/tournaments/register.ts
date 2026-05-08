import { z } from "zod";
import { RegisterResponseSchema } from "@codetype/shared/tournaments";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireTournamentsEnabled } from "../../src/AppError";
import { commandBus, RegisterForTournamentCommand } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireTournamentsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("missing tournament id");
    try {
        const result = await commandBus.dispatch(
            new RegisterForTournamentCommand({
                userId: ctx.userId,
                tournId: id,
                nowIso: new Date().toISOString(),
            }),
        );
        return RegisterResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
