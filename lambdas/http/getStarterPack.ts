import { z } from "zod";
import { SnippetSchema } from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError } from "../src/AppError";
import { GetStarterPackQuery, queryBus } from "./_container";

const EmptyBody = z.object({}).passthrough();

const QuerySchema = z.object({
    languages: z
        .string()
        .optional()
        .transform((s) =>
            s
                ? s
                    .split(",")
                    .map((x) => x.trim().toLowerCase())
                    .filter(Boolean)
                : [],
        ),
    n: z
        .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int())
        .optional()
        .transform((v) => Math.max(1, Math.min(100, v ?? 30))),
});

const ResponseSchema = z.object({
    snippets: z.array(SnippetSchema),
});

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const { languages, n } = QuerySchema.parse({
        languages: ctx.queryStringParameters.languages,
        n: ctx.queryStringParameters.n,
    });
    try {
        const result = await queryBus.execute(
            new GetStarterPackQuery({ languages, n }),
        );
        return ResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
