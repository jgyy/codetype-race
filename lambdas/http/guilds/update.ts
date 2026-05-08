import {
    GuildSchema,
    UpdateGuildRequestSchema,
} from "@codetype/shared/social";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireGuildsEnabled } from "../../src/AppError";
import { commandBus, UpdateGuildCommand } from "../_container";

export const handler = withHttp(UpdateGuildRequestSchema, async (input, ctx) => {
    requireGuildsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("id required");
    try {
        const result = await commandBus.dispatch(
            new UpdateGuildCommand({ actorId: ctx.userId, guildId: id, patch: input }),
        );
        return GuildSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
