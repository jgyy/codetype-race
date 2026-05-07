import { z } from "zod";
import { ListPendingResponseSchema } from "@codetype/shared/schemas";
import { withHttp } from "../src/middleware";
import { requireAdmin } from "../src/AppError";
import { snippets } from "../src/repos/SnippetRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
  requireAdmin(ctx);
  const items = await snippets.listPending(100);
  return ListPendingResponseSchema.parse({ items });
});
