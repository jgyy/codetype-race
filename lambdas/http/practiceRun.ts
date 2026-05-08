import {
    PracticeRunRequestSchema,
    PracticeRunResponseSchema,
} from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError } from "../src/AppError";
import { commandBus, PracticeRunCommand } from "./_container";

export const handler = withHttp(
    PracticeRunRequestSchema,
    async (input, ctx) => {
        try {
            const result = await commandBus.dispatch(
                new PracticeRunCommand({
                    userId: ctx.userId,
                    snippetId: input.snippet_id,
                    chars_typed: input.chars_typed,
                    errors: input.errors,
                    duration_ms: input.duration_ms,
                    save: input.save,
                }),
            );
            return PracticeRunResponseSchema.parse(result);
        } catch (e) {
            if (e instanceof DomainError) {
                throw new AppError(e.code, e.status, e.message, e.details);
            }
            throw e;
        }
    },
);
