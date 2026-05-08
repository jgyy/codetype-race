import { z } from "zod";
import { GetLeaderboardResponseSchema } from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError } from "../src/AppError";
import { GetLeaderboardQuery, queryBus } from "./_container";

const EmptyBody = z.object({}).passthrough();

const QuerySchema = z.object({
    lang: z.string().optional(),
    limit: z
        .preprocess(
            (v) => (typeof v === "string" ? Number(v) : v),
            z.number().int().min(1).max(500),
        )
        .optional(),
});

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const q = QuerySchema.parse({
        lang: ctx.queryStringParameters.lang,
        limit: ctx.queryStringParameters.limit,
    });
    try {
        const result = await queryBus.execute(
            new GetLeaderboardQuery({
                language: q.lang,
                limit: q.limit ?? 100,
            }),
        );
        return GetLeaderboardResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
