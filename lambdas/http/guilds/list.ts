import { z } from "zod";
import { ListGuildsResponseSchema } from "@codetype/shared/social";
import { withHttp } from "../../src/middleware";
import { Errors, requireGuildsEnabled } from "../../src/AppError";
import { guilds } from "../../src/repos/GuildRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireGuildsEnabled();
    const q = (ctx.queryStringParameters.q ?? "").trim();
    const visibility = ctx.queryStringParameters.visibility ?? "public";
    if (visibility !== "public") {
        // Private discovery is not a thing; explicitly refuse so callers
        // don't receive empty silently.
        throw Errors.BadRequest("only visibility=public is searchable");
    }
    if (q.length < 3) {
        throw Errors.BadRequest("query must be 3+ chars");
    }
    const list = await guilds.discoverPublic(q, 25);
    return ListGuildsResponseSchema.parse({ guilds: list });
});
