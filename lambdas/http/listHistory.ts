import { z } from "zod";
import { ListHistoryResponseSchema } from "@codetype/shared/schemas";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { history } from "../src/repos/HistoryRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
  if (!ctx.userId) throw Errors.Unauthorized();
  const results = await history.listForHost(ctx.userId);
  return ListHistoryResponseSchema.parse({ results });
});
