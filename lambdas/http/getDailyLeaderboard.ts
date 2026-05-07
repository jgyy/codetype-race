import { z } from "zod";
import { GetDailyLeaderboardResponseSchema } from "@codetype/shared/schemas";
import { withHttp } from "../src/middleware";
import { daily, todayUTC } from "../src/repos/DailyRepo";

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
  const date = q.date ?? todayUTC();
  const limit = q.limit ?? 100;
  const runs = await daily.listRuns(date, limit);
  return GetDailyLeaderboardResponseSchema.parse({
    date,
    entries: runs.map((r) => ({
      user_id: r.user_id,
      display_name: r.display_name,
      scaled_wpm: r.scaled_wpm,
      finished_at: r.finished_at,
    })),
  });
});
