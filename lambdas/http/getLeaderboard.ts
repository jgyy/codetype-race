import { z } from "zod";
import {
  GetLeaderboardResponseSchema,
} from "@codetype/shared/schemas";
import {
  leaderboardGlobalPK,
  leaderboardLangPK,
} from "@codetype/shared/ddb-keys";
import { withHttp } from "../src/middleware";
import { users } from "../src/repos/UserRepo";

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
  const pk = q.lang ? leaderboardLangPK(q.lang) : leaderboardGlobalPK();
  const entries = await users.listLeaderboard(pk, q.limit ?? 100);
  return GetLeaderboardResponseSchema.parse({ entries });
});
