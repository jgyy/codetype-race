import { z } from "zod";
import { ListFriendsResponseSchema } from "@codetype/shared/social";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireFriendsEnabled } from "../../src/AppError";
import { ListFriendsQuery, queryBus } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireFriendsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    try {
        const result = await queryBus.execute(
            new ListFriendsQuery({
                userId: ctx.userId,
                presenceEnabled: process.env.ENABLE_PRESENCE === "true",
            }),
        );
        return ListFriendsResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
