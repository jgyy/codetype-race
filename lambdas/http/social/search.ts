import { z } from "zod";
import {
    UserSearchQuerySchema,
    UserSearchResponseSchema,
} from "@codetype/shared/social";
import { withHttp } from "../../src/middleware";
import { Errors, requireFriendsEnabled } from "../../src/AppError";
import { users } from "../../src/repos/UserRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireFriendsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const q = ctx.queryStringParameters.q ?? "";
    const parsed = UserSearchQuerySchema.safeParse(q);
    if (!parsed.success) {
        throw Errors.BadRequest("query must be 3+ chars");
    }
    const profiles = await users.searchByHandlePrefix(parsed.data, 25);
    return UserSearchResponseSchema.parse({
        results: profiles
            .filter((p) => p.user_id !== ctx.userId)
            .map((p) => ({
                user_id: p.user_id,
                display_name: p.display_name,
                rating: p.rating,
            })),
    });
});
