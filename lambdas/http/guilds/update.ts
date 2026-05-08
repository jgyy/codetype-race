import {
    GuildSchema,
    UpdateGuildRequestSchema,
} from "@codetype/shared/social";
import { withHttp } from "../../src/middleware";
import { Errors, requireGuildsEnabled } from "../../src/AppError";
import { guilds } from "../../src/repos/GuildRepo";

export const handler = withHttp(UpdateGuildRequestSchema, async (input, ctx) => {
    requireGuildsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("id required");
    const guild = await guilds.get(id);
    if (!guild) throw Errors.NotFound("guild");
    if (guild.ownerId !== ctx.userId) throw Errors.Forbidden();
    const updated = await guilds.update(id, input, guild);
    return GuildSchema.parse(updated);
});
