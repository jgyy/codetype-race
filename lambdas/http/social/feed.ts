import { z } from "zod";
import { FeedResponseSchema } from "@codetype/shared/social";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors } from "../../src/AppError";
import { GetFeedQuery, queryBus } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const target = ctx.pathParameters.userId;
    if (!target) throw Errors.BadRequest("userId required");
    try {
        const result = await queryBus.execute(
            new GetFeedQuery({
                targetUserId: target,
                viewerUserId: ctx.userId,
            }),
        );
        return FeedResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
