import { z } from "zod";
import { RedeemInviteResponseSchema } from "@codetype/shared/social";
import { withHttp } from "../../../src/middleware";
import { Errors, requireGuildsEnabled } from "../../../src/AppError";
import { guilds } from "../../../src/repos/GuildRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireGuildsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const code = ctx.pathParameters.code;
    if (!code) throw Errors.BadRequest("code required");
    const invite = await guilds.findInviteByCode(code);
    if (!invite) throw Errors.NotFound("invite");
    const existing = await guilds.getMember(invite.guildId, ctx.userId);
    if (existing) {
        return RedeemInviteResponseSchema.parse({
            guild_id: invite.guildId,
            role: existing.role,
        });
    }
    await guilds.addMember(
        invite.guildId,
        ctx.userId,
        "member",
        new Date().toISOString(),
    );
    return RedeemInviteResponseSchema.parse({
        guild_id: invite.guildId,
        role: "member",
    });
});
