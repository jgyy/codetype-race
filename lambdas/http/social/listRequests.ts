import { z } from "zod";
import { ListFriendRequestsResponseSchema } from "@codetype/shared/social";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireFriendsEnabled } from "../../src/AppError";
import { ListFriendRequestsQuery, queryBus } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireFriendsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    try {
        const result = await queryBus.execute(
            new ListFriendRequestsQuery(ctx.userId),
        );
        return ListFriendRequestsResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
