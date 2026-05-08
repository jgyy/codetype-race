import {
    DailySubmitRequestSchema,
    DailySubmitResponseSchema,
} from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError, Errors } from "../src/AppError";
import { commandBus, DailySubmitCommand } from "./_container";

export const handler = withHttp(
    DailySubmitRequestSchema,
    async (input, ctx) => {
        if (!ctx.userId) throw Errors.Unauthorized();
        try {
            const result = await commandBus.dispatch(
                new DailySubmitCommand({
                    userId: ctx.userId,
                    snippetId: input.snippet_id,
                    date: input.date,
                    chars_typed: input.chars_typed,
                    errors: input.errors,
                    duration_ms: input.duration_ms,
                }),
            );
            return DailySubmitResponseSchema.parse(result);
        } catch (e) {
            if (e instanceof DomainError) {
                throw new AppError(e.code, e.status, e.message, e.details);
            }
            throw e;
        }
    },
);
