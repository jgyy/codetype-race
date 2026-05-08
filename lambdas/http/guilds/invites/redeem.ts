import { z } from "zod";
import { RedeemInviteResponseSchema } from "@codetype/shared/social";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../../src/middleware";
import { AppError, Errors, requireGuildsEnabled } from "../../../src/AppError";
import { commandBus, RedeemGuildInviteCommand } from "../../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireGuildsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const code = ctx.pathParameters.code;
    if (!code) throw Errors.BadRequest("code required");
    try {
        const result = await commandBus.dispatch(
            new RedeemGuildInviteCommand({
                actorId: ctx.userId,
                code,
                nowIso: new Date().toISOString(),
            }),
        );
        return RedeemInviteResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
