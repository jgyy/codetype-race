import { z } from "zod";
import { FeedResponseSchema, type FeedEvent } from "@codetype/shared/social";
import { withHttp } from "../../src/middleware";
import { Errors } from "../../src/AppError";
import { feed } from "../../src/repos/FeedRepo";
import { guilds } from "../../src/repos/GuildRepo";
import { friends } from "../../src/repos/FriendsRepo";

const EmptyBody = z.object({}).passthrough();

/**
 * Visibility rules:
 *   - `joined_guild` / `left_guild` events for a private guild are
 *     suppressed unless the viewer is currently a member of that guild.
 *   - All other event types are public.
 *   - Blocked users see nothing of each other.
 *
 * Guild-visibility lookups are memoised per request so a feed full of
 * guild events doesn't fan out into one Get per row.
 */
export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const target = ctx.pathParameters.userId;
    if (!target) throw Errors.BadRequest("userId required");

    if (ctx.userId && ctx.userId !== target) {
        const edge = await friends.getEdge(ctx.userId, target);
        if (edge?.status === "blocked") throw Errors.NotFound("user");
    }

    const events = await feed.list(target);
    const filtered = await filterForViewer(events, ctx.userId ?? null);
    return FeedResponseSchema.parse({ events: filtered });
});

async function filterForViewer(
    events: FeedEvent[],
    viewerId: string | null,
): Promise<FeedEvent[]> {
    const guildCache = new Map<string, { visibility: "public" | "private" } | null>();
    const memberCache = new Map<string, boolean>();

    async function isVisibleGuild(guildId: string): Promise<boolean> {
        let g = guildCache.get(guildId);
        if (g === undefined) {
            const fetched = await guilds.get(guildId);
            g = fetched ? { visibility: fetched.visibility } : null;
            guildCache.set(guildId, g);
        }
        if (!g) return false;
        if (g.visibility === "public") return true;
        if (!viewerId) return false;
        const cacheKey = `${viewerId}:${guildId}`;
        let isMember = memberCache.get(cacheKey);
        if (isMember === undefined) {
            isMember = !!(await guilds.getMember(guildId, viewerId));
            memberCache.set(cacheKey, isMember);
        }
        return isMember;
    }

    const out: FeedEvent[] = [];
    for (const ev of events) {
        if (ev.type === "joined_guild" || ev.type === "left_guild") {
            const gid = ev.payload.guild_id;
            if (typeof gid === "string" && !(await isVisibleGuild(gid))) continue;
        }
        out.push(ev);
    }
    return out;
}
