import { z } from "zod";
import {
    SeasonIdSchema,
    SeasonLeaderboardResponseSchema,
} from "@codetype/shared/tournaments";
import { withHttp } from "../../src/middleware";
import { Errors } from "../../src/AppError";
import { seasons } from "../../src/repos/SeasonRepo";

const EmptyBody = z.object({}).passthrough();

const QuerySchema = z.object({
    lang: z.string().optional(),
    limit: z
        .preprocess(
            (v) => (typeof v === "string" ? Number(v) : v),
            z.number().int().min(1).max(1000),
        )
        .optional(),
});

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const id = SeasonIdSchema.parse(ctx.pathParameters.id ?? "");
    const q = QuerySchema.parse({
        lang: ctx.queryStringParameters.lang,
        limit: ctx.queryStringParameters.limit,
    });
    const lang = q.lang ?? "*";
    const season = await seasons.get(id);
    if (!season) throw Errors.NotFound("season");
    const rows = await seasons.getLeaderboard(id, lang, q.limit ?? 100);
    return SeasonLeaderboardResponseSchema.parse({
        seasonId: id,
        language: lang,
        rows,
    });
});
