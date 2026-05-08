import { z } from "zod";
import { GuildDetailResponseSchema } from "@codetype/shared/social";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireGuildsEnabled } from "../../src/AppError";
import { GetGuildQuery, queryBus } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireGuildsEnabled();
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("id required");
    try {
        const result = await queryBus.execute(new GetGuildQuery(id, ctx.userId));
        return GuildDetailResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
