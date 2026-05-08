import { z } from "zod";
import { GuildLeaderboardResponseSchema } from "@codetype/shared/social";
import { withHttp } from "../../src/middleware";
import { Errors, requireGuildsEnabled } from "../../src/AppError";
import { guilds } from "../../src/repos/GuildRepo";
import { users } from "../../src/repos/UserRepo";

const EmptyBody = z.object({}).passthrough();

// Guild leaderboard is a small set (≤50 members), so we materialise it
// per-request rather than maintaining a separate ranked partition.
export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireGuildsEnabled();
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("id required");
    const lang = (ctx.queryStringParameters.lang ?? "*").trim();
    const guild = await guilds.get(id);
    if (!guild) throw Errors.NotFound("guild");
    if (guild.visibility === "private") {
        if (!ctx.userId) throw Errors.NotFound("guild");
        const me = await guilds.getMember(id, ctx.userId);
        if (!me) throw Errors.NotFound("guild");
    }
    const members = await guilds.listMembers(id);
    const profiles = await Promise.all(
        members.map((m) => users.getProfile(m.userId)),
    );
    const scored = members
        .map((m, i) => {
            const p = profiles[i];
            const rating =
                lang === "*"
                    ? p?.rating ?? 0
                    : p?.best_wpm?.[lang]
                        ? Math.round(p.best_wpm[lang]!)
                        : 0;
            return {
                user_id: m.userId,
                display_name: p?.display_name ?? m.userId.slice(0, 8),
                rating,
            };
        })
        .sort((a, b) => b.rating - a.rating);
    return GuildLeaderboardResponseSchema.parse({
        guild_id: id,
        language: lang,
        entries: scored.map((s, i) => ({ ...s, rank: i + 1 })),
    });
});
