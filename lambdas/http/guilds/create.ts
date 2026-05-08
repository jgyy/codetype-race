import {
    CreateGuildRequestSchema,
    GuildSchema,
} from "@codetype/shared/social";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireGuildsEnabled } from "../../src/AppError";
import { commandBus, CreateGuildCommand } from "../_container";

export const handler = withHttp(CreateGuildRequestSchema, async (input, ctx) => {
    requireGuildsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    try {
        const result = await commandBus.dispatch(
            new CreateGuildCommand({
                ownerId: ctx.userId,
                name: input.name,
                slug: input.slug,
                visibility: input.visibility,
                description: input.description,
                nowIso: new Date().toISOString(),
            }),
        );
        return GuildSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
