import { z } from "zod";
import { withHttp } from "../../src/middleware";
import { Errors, requireGuildsEnabled } from "../../src/AppError";
import { canKick, guilds } from "../../src/repos/GuildRepo";
import { feed } from "../../src/repos/FeedRepo";

const EmptyBody = z.object({}).passthrough();

// Same handler for "leave" (self) and "kick" (someone else). The path
// param userId disambiguates: equal to caller → leave; otherwise → kick.
export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireGuildsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const id = ctx.pathParameters.id;
    const targetUserId = ctx.pathParameters.userId;
    if (!id || !targetUserId) throw Errors.BadRequest("ids required");

    const guild = await guilds.get(id);
    if (!guild) throw Errors.NotFound("guild");

    if (targetUserId !== ctx.userId) {
        const actor = await guilds.getMember(id, ctx.userId);
        const target = await guilds.getMember(id, targetUserId);
        if (!actor) throw Errors.Forbidden();
        if (!target) throw Errors.NotFound("member");
        if (!canKick(actor.role, target.role)) throw Errors.Forbidden();
    }

    await guilds.removeMember(id, targetUserId);
    await feed.append(targetUserId, "left_guild", { guild_id: id });
    return { status: "removed" } as const;
});
