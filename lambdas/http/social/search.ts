import { z } from "zod";
import {
    UserSearchQuerySchema,
    UserSearchResponseSchema,
} from "@codetype/shared/social";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireFriendsEnabled } from "../../src/AppError";
import { queryBus, SearchUsersQuery } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireFriendsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const q = ctx.queryStringParameters.q ?? "";
    const parsed = UserSearchQuerySchema.safeParse(q);
    if (!parsed.success) {
        throw Errors.BadRequest("query must be 3+ chars");
    }
    try {
        const result = await queryBus.execute(
            new SearchUsersQuery(ctx.userId, parsed.data),
        );
        return UserSearchResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
