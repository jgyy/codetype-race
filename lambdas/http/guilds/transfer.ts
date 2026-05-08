import { TransferGuildRequestSchema } from "@codetype/shared/social";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireGuildsEnabled } from "../../src/AppError";
import { commandBus, TransferGuildOwnershipCommand } from "../_container";

export const handler = withHttp(
    TransferGuildRequestSchema,
    async (input, ctx) => {
        requireGuildsEnabled();
        if (!ctx.userId) throw Errors.Unauthorized();
        const id = ctx.pathParameters.id;
        if (!id) throw Errors.BadRequest("id required");
        try {
            return await commandBus.dispatch(
                new TransferGuildOwnershipCommand({
                    actorId: ctx.userId,
                    guildId: id,
                    newOwnerId: input.new_owner_id,
                }),
            );
        } catch (e) {
            if (e instanceof DomainError) {
                throw new AppError(e.code, e.status, e.message, e.details);
            }
            throw e;
        }
    },
);
