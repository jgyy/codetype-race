import { z } from "zod";
import {
    SeasonIdSchema,
    SeasonLeaderboardResponseSchema,
} from "@codetype/shared/tournaments";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { CacheControl } from "../../src/cacheControl";
import { AppError } from "../../src/AppError";
import { GetSeasonLeaderboardQuery, queryBus } from "../_container";

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

export const handler = withHttp(
    EmptyBody,
    async (_input, ctx) => {
        const id = SeasonIdSchema.parse(ctx.pathParameters.id ?? "");
        const q = QuerySchema.parse({
            lang: ctx.queryStringParameters.lang,
            limit: ctx.queryStringParameters.limit,
        });
        try {
            const result = await queryBus.execute(
                new GetSeasonLeaderboardQuery({
                    id,
                    lang: q.lang ?? "*",
                    limit: q.limit ?? 100,
                }),
            );
            return SeasonLeaderboardResponseSchema.parse(result);
        } catch (e) {
            if (e instanceof DomainError) {
                throw new AppError(e.code, e.status, e.message, e.details);
            }
            throw e;
        }
    },
    // The response shape doesn't expose season status, so we always use
    // the live-leaderboard policy (10 s shared-cache TTL). Marking an
    // archived season immutable would be wrong if we couldn't tell —
    // bumping to ARCHIVED requires the query response carrying a
    // `frozen` flag, which is a follow-up.
    { cacheControl: CacheControl.LEADERBOARD_LIVE },
);
