import { z } from "zod";
import { generateRoomCode } from "@codetype/shared/ddb-keys";
import { CreateInviteResponseSchema } from "@codetype/shared/social";
import { withHttp } from "../../../src/middleware";
import { Errors, requireGuildsEnabled } from "../../../src/AppError";
import { guilds } from "../../../src/repos/GuildRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireGuildsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("id required");
    const member = await guilds.getMember(id, ctx.userId);
    if (!member || member.role === "member") throw Errors.Forbidden();
    // 8-char invite codes; collision probability is ~0 at our scale,
    // but createInvite uses a conditional Put so collisions surface as 409.
    const code = `${generateRoomCode()}${generateRoomCode().slice(0, 2)}`;
    const result = await guilds.createInvite(id, code, ctx.userId);
    return CreateInviteResponseSchema.parse({
        code: result.code,
        expires_at: result.expiresAt,
    });
});
