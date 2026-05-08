import { z } from "zod";
import { ListGuildsResponseSchema } from "@codetype/shared/social";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireGuildsEnabled } from "../../src/AppError";
import { ListGuildsQuery, queryBus } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireGuildsEnabled();
    const q = (ctx.queryStringParameters.q ?? "").trim();
    const visibility = ctx.queryStringParameters.visibility ?? "public";
    if (visibility !== "public") {
        throw Errors.BadRequest("only visibility=public is searchable");
    }
    if (q.length < 3) {
        throw Errors.BadRequest("query must be 3+ chars");
    }
    try {
        const result = await queryBus.execute(new ListGuildsQuery(q));
        return ListGuildsResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
