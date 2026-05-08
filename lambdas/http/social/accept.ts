import { z } from "zod";
import { FriendActionResponseSchema } from "@codetype/shared/social";
import { withHttp } from "../../src/middleware";
import { Errors, requireFriendsEnabled } from "../../src/AppError";
import { friends } from "../../src/repos/FriendsRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireFriendsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const requester = ctx.pathParameters.userId;
    if (!requester) throw Errors.BadRequest("userId required");
    await friends.accept(ctx.userId, requester);
    return FriendActionResponseSchema.parse({ status: "accepted" });
});
