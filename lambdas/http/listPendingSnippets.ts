import { z } from "zod";
import { ListPendingResponseSchema } from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError, requireAdmin } from "../src/AppError";
import { ListPendingSnippetsQuery, queryBus } from "./_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireAdmin(ctx);
    try {
        const result = await queryBus.execute(new ListPendingSnippetsQuery(100));
        return ListPendingResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
