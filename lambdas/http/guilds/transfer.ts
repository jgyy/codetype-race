import { z } from "zod";
import { TransferGuildRequestSchema } from "@codetype/shared/social";
import { withHttp } from "../../src/middleware";
import { Errors, requireGuildsEnabled } from "../../src/AppError";
import { guilds } from "../../src/repos/GuildRepo";

export const handler = withHttp(
    TransferGuildRequestSchema,
    async (input, ctx) => {
        requireGuildsEnabled();
        if (!ctx.userId) throw Errors.Unauthorized();
        const id = ctx.pathParameters.id;
        if (!id) throw Errors.BadRequest("id required");
        const guild = await guilds.get(id);
        if (!guild) throw Errors.NotFound("guild");
        if (guild.ownerId !== ctx.userId) throw Errors.Forbidden();
        const member = await guilds.getMember(id, input.new_owner_id);
        if (!member) throw Errors.BadRequest("new owner is not a member");
        await guilds.transferOwnership(id, ctx.userId, input.new_owner_id);
        return { status: "transferred" } as const;
    },
);
