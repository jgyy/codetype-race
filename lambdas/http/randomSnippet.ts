import { z } from "zod";
import {
    DifficultySchema,
    SnippetSchema,
} from "@codetype/shared/schemas";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { snippets } from "../src/repos/SnippetRepo";

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

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const filters = QuerySchema.parse({
        language: ctx.queryStringParameters.language,
        difficulty: ctx.queryStringParameters.difficulty,
    });

    const picked = await snippets.random(filters);
    if (!picked) throw Errors.NotFound("snippet");
    return SnippetSchema.parse(picked);
});
