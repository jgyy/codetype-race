import { z } from "zod";
import { GuildMembersResponseSchema } from "@codetype/shared/social";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireGuildsEnabled } from "../../src/AppError";
import { ListGuildMembersQuery, queryBus } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireGuildsEnabled();
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("id required");
    try {
        const result = await queryBus.execute(
            new ListGuildMembersQuery({ guildId: id, viewerUserId: ctx.userId }),
        );
        return GuildMembersResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
