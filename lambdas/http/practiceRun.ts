import {
  PracticeRunRequestSchema,
  PracticeRunResponseSchema,
} from "@codetype/shared/schemas";
import { accuracy, grossWpm, netWpm, scaledWpm } from "@codetype/shared/wpm";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { history } from "../src/repos/HistoryRepo";
import { snippets } from "../src/repos/SnippetRepo";

export const handler = withHttp(
  PracticeRunRequestSchema,
  async (input, ctx) => {
    if (!ctx.userId && input.save) throw Errors.Unauthorized();

    const snippet = await snippets.getById(input.snippet_id);
    if (!snippet) throw Errors.NotFound("snippet");
    if (input.chars_typed < snippet.length) {
      throw Errors.BadRequest("incomplete");
    }

    const finishedAt = Date.now();
    const gross = grossWpm(input.chars_typed, input.duration_ms);
    const net = netWpm(input.chars_typed, input.errors, input.duration_ms);
    const acc = accuracy(input.chars_typed, input.errors);
    const scaled = scaledWpm(input.chars_typed, input.errors, input.duration_ms);

    let saved = false;
    if (input.save && ctx.userId) {
      await history.appendPractice({
        user_id: ctx.userId,
        snippet_id: input.snippet_id,
        finished_at: finishedAt,
        chars_typed: input.chars_typed,
        errors: input.errors,
        duration_ms: input.duration_ms,
        gross_wpm: gross,
        net_wpm: net,
        accuracy: acc,
        scaled_wpm: scaled,
      });
      saved = true;
    }

    return PracticeRunResponseSchema.parse({
      finished_at: finishedAt,
      gross_wpm: gross,
      net_wpm: net,
      accuracy: acc,
      scaled_wpm: scaled,
      saved,
    });
  },
);
