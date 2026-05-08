import { z } from "zod";
import { GuildDetailResponseSchema } from "@codetype/shared/social";
import { withHttp } from "../../src/middleware";
import { Errors, requireGuildsEnabled } from "../../src/AppError";
import { guilds } from "../../src/repos/GuildRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireGuildsEnabled();
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("id required");
    const guild = await guilds.get(id);
    if (!guild) throw Errors.NotFound("guild");
    let viewerRole = null;
    if (ctx.userId) {
        const m = await guilds.getMember(id, ctx.userId);
        viewerRole = m?.role ?? null;
    }
    if (guild.visibility === "private" && viewerRole === null) {
        throw Errors.NotFound("guild");
    }
    return GuildDetailResponseSchema.parse({
        guild,
        viewer_role: viewerRole,
    });
});
