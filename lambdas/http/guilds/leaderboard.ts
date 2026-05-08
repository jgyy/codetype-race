import { z } from "zod";
import { GuildLeaderboardResponseSchema } from "@codetype/shared/social";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireGuildsEnabled } from "../../src/AppError";
import { GetGuildLeaderboardQuery, queryBus } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireGuildsEnabled();
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("id required");
    const lang = (ctx.queryStringParameters.lang ?? "*").trim();
    try {
        const result = await queryBus.execute(
            new GetGuildLeaderboardQuery({
                guildId: id,
                viewerUserId: ctx.userId,
                lang,
            }),
        );
        return GuildLeaderboardResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
