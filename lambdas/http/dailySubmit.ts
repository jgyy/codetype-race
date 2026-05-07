import {
  DailySubmitRequestSchema,
  DailySubmitResponseSchema,
} from "@codetype/shared/schemas";
import { scaledWpm } from "@codetype/shared/wpm";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { daily } from "../src/repos/DailyRepo";
import { snippets } from "../src/repos/SnippetRepo";
import { users } from "../src/repos/UserRepo";

// Sanity bounds for anti-cheat-lite. Phase 07 will tighten these.
const MAX_WPM = 300;

export const handler = withHttp(
  DailySubmitRequestSchema,
  async (input, ctx) => {
    if (!ctx.userId) throw Errors.Unauthorized();

    const snippet = await snippets.getById(input.snippet_id);
    if (!snippet) throw Errors.NotFound("snippet");
    if (input.chars_typed < snippet.length) {
      throw Errors.BadRequest("incomplete");
    }

    const wpm = scaledWpm(input.chars_typed, input.errors, input.duration_ms);
    if (wpm < 0 || wpm > MAX_WPM) {
      throw Errors.BadRequest("wpm out of range");
    }

    // We need the player's display_name; fall back to a derived name
    // if their profile hasn't been seeded yet.
    const profile = await users.getOrCreate(ctx.userId, ctx.userId.slice(0, 8));
    const result = await daily.submitBest(
      input.date,
      ctx.userId,
      profile.display_name,
      wpm,
    );

    // Compute rank by counting RUN# items with a strictly better wpm
    // (smaller padded SK). For top-100 pages this is fine; if the
    // leaderboard grows huge, switch to maintaining a rank counter.
    const runs = await daily.listRuns(input.date, 1000);
    const rank =
      runs.findIndex((r) => r.user_id === ctx.userId) + 1 || runs.length + 1;

    return DailySubmitResponseSchema.parse({
      improved: result.improved,
      best_wpm: result.bestWpm,
      rank,
    });
  },
);
