import { z } from "zod";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireGuildsEnabled } from "../../src/AppError";
import { commandBus, LeaveOrKickGuildMemberCommand } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireGuildsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const id = ctx.pathParameters.id;
    const targetUserId = ctx.pathParameters.userId;
    if (!id || !targetUserId) throw Errors.BadRequest("ids required");
    try {
        return await commandBus.dispatch(
            new LeaveOrKickGuildMemberCommand({
                actorId: ctx.userId,
                guildId: id,
                targetUserId,
            }),
        );
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
