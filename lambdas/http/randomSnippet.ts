import { z } from "zod";
import { DifficultySchema, SnippetSchema } from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { CacheControl } from "../src/cacheControl";
import { AppError } from "../src/AppError";
import { GetRandomSnippetQuery, queryBus } from "./_container";

const EmptyBody = z.object({}).passthrough();

const QuerySchema = z.object({
    language: z.string().optional(),
    difficulty: z
        .preprocess(
            (v) => (typeof v === "string" ? Number(v) : v),
            DifficultySchema,
        )
        .optional(),
});

export const handler = withHttp(
    EmptyBody,
    async (_input, ctx) => {
        const filters = QuerySchema.parse({
            language: ctx.queryStringParameters.language,
            difficulty: ctx.queryStringParameters.difficulty,
        });
        try {
            const result = await queryBus.execute(new GetRandomSnippetQuery(filters));
            return SnippetSchema.parse(result);
        } catch (e) {
            if (e instanceof DomainError) {
                throw new AppError(e.code, e.status, e.message, e.details);
            }
            throw e;
        }
    },
    { cacheControl: CacheControl.SNIPPET_LIST },
);
