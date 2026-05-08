import { z } from "zod";
import { ListHistoryResponseSchema } from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError, Errors } from "../src/AppError";
import { ListHistoryQuery, queryBus } from "./_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    if (!ctx.userId) throw Errors.Unauthorized();
    try {
        const result = await queryBus.execute(new ListHistoryQuery(ctx.userId));
        return ListHistoryResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
