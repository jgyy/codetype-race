import { v7 as uuidv7 } from "uuid";
import { SnippetSubmissionSchema } from "@codetype/shared/schemas";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { snippets } from "../src/repos/SnippetRepo";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export const handler = withHttp(
  SnippetSubmissionSchema,
  async (input, ctx) => {
    if (!ctx.userId) throw Errors.Unauthorized();
    await snippets.incrementDailySubmitCounter(ctx.userId, todayUTC(), 5);
    const snippetId = uuidv7();
    await snippets.submitPending(snippetId, ctx.userId, input);
    return { snippet_id: snippetId, status: "pending" as const };
  },
);
