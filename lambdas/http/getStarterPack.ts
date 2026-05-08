import { z } from "zod";
import { SnippetSchema } from "@codetype/shared/schemas";
import { withHttp } from "../src/middleware";
import { snippets } from "../src/repos/SnippetRepo";

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

    let pool: Awaited<ReturnType<typeof snippets.list>> = [];
    if (languages.length === 0) {
        pool = await snippets.list({}, n * 2);
    } else {
        const perLang = Math.max(1, Math.ceil(n / languages.length));
        const results = await Promise.all(
            languages.map((language) => snippets.list({ language }, perLang * 2)),
        );
        pool = results.flat();
    }

    const seen = new Set<string>();
    const out: typeof pool = [];
    for (const s of pool) {
        if (seen.has(s.snippet_id)) continue;
        seen.add(s.snippet_id);
        out.push(s);
        if (out.length >= n) break;
    }

    return ResponseSchema.parse({ snippets: out });
});
