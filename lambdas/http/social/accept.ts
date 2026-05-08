import { z } from "zod";
import { FriendActionResponseSchema } from "@codetype/shared/social";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireFriendsEnabled } from "../../src/AppError";
import { AcceptFriendRequestCommand, commandBus } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireFriendsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const requester = ctx.pathParameters.userId;
    if (!requester) throw Errors.BadRequest("userId required");
    try {
        const result = await commandBus.dispatch(
            new AcceptFriendRequestCommand({
                actorId: ctx.userId,
                targetId: requester,
            }),
        );
        return FriendActionResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
