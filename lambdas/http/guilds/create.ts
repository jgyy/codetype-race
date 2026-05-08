import { v4 as uuidv4 } from "uuid";
import {
    CreateGuildRequestSchema,
    GuildSchema,
    type Guild,
} from "@codetype/shared/social";
import { withHttp } from "../../src/middleware";
import { Errors, requireGuildsEnabled } from "../../src/AppError";
import { guilds } from "../../src/repos/GuildRepo";

export const handler = withHttp(CreateGuildRequestSchema, async (input, ctx) => {
    requireGuildsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const guild: Guild = {
        id: uuidv4(),
        name: input.name,
        slug: input.slug,
        visibility: input.visibility,
        ownerId: ctx.userId,
        description: input.description ?? "",
        memberCount: 1,
        createdAt: new Date().toISOString(),
    };
    await guilds.create(guild);
    return GuildSchema.parse(guild);
});
