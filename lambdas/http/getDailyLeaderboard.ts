import { z } from "zod";
import { GetDailyLeaderboardResponseSchema } from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError } from "../src/AppError";
import { todayUTC } from "../src/repos/DailyRepo";
import { GetDailyLeaderboardQuery, queryBus } from "./_container";

const EmptyBody = z.object({}).passthrough();

const QuerySchema = z.object({
    date: z.string().optional(),
    limit: z
        .preprocess(
            (v) => (typeof v === "string" ? Number(v) : v),
            z.number().int().min(1).max(500),
        )
        .optional(),
});

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const q = QuerySchema.parse({
        date: ctx.queryStringParameters.date,
        limit: ctx.queryStringParameters.limit,
    });
    try {
        const result = await queryBus.execute(
            new GetDailyLeaderboardQuery(q.date ?? todayUTC(), q.limit ?? 100),
        );
        return GetDailyLeaderboardResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
