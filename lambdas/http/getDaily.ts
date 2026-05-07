import { z } from "zod";
import { GetDailyResponseSchema } from "@codetype/shared/schemas";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { daily, todayUTC } from "../src/repos/DailyRepo";
import { snippets } from "../src/repos/SnippetRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async () => {
  const date = todayUTC();
  const meta = await daily.getMeta(date);
  if (!meta) throw Errors.NotFound("daily");
  const snippet = await snippets.getById(meta.snippet_id);
  if (!snippet) throw Errors.NotFound("snippet");
  return GetDailyResponseSchema.parse({ date, snippet });
});
