import { SnippetSubmissionSchema } from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError, Errors } from "../src/AppError";
import { commandBus, SubmitSnippetCommand } from "./_container";

function todayUTC(): string {
    return new Date().toISOString().slice(0, 10);
}

export const handler = withHttp(SnippetSubmissionSchema, async (input, ctx) => {
    if (!ctx.userId) throw Errors.Unauthorized();
    try {
        return await commandBus.dispatch(
            new SubmitSnippetCommand({
                userId: ctx.userId,
                dateUtc: todayUTC(),
                submission: input,
            }),
        );
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
