import { z } from "zod";
import { ListFriendRequestsResponseSchema } from "@codetype/shared/social";
import { withHttp } from "../../src/middleware";
import { Errors, requireFriendsEnabled } from "../../src/AppError";
import { friends } from "../../src/repos/FriendsRepo";
import { users } from "../../src/repos/UserRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireFriendsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const rows = await friends.listIncomingRequests(ctx.userId);
    const profiles = await Promise.all(
        rows.map((r) => users.getProfile(r.fromUserId)),
    );
    return ListFriendRequestsResponseSchema.parse({
        incoming: rows.map((row, i) => ({
            from_user_id: row.fromUserId,
            display_name: profiles[i]?.display_name ?? row.fromUserId.slice(0, 8),
            rating: profiles[i]?.rating ?? 0,
            created_at: row.createdAt,
        })),
    });
});
