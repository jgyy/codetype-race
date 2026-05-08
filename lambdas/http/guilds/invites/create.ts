import { z } from "zod";
import { generateRoomCode } from "@codetype/shared/ddb-keys";
import { CreateInviteResponseSchema } from "@codetype/shared/social";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../../src/middleware";
import { AppError, Errors, requireGuildsEnabled } from "../../../src/AppError";
import { commandBus, CreateGuildInviteCommand } from "../../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireGuildsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("id required");
    const code = `${generateRoomCode()}${generateRoomCode().slice(0, 2)}`;
    try {
        const result = await commandBus.dispatch(
            new CreateGuildInviteCommand({
                actorId: ctx.userId,
                guildId: id,
                code,
            }),
        );
        return CreateInviteResponseSchema.parse({
            code: result.code,
            expires_at: result.expires_at,
        });
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
