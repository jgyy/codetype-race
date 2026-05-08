import { z } from "zod";
import { RULES_BY_ID } from "@codetype/shared/progression/rules";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireProgressionEnabled } from "../../src/AppError";
import { ListPublicAchievementsQuery, queryBus } from "../_container";

const EmptyBody = z.object({}).passthrough();

const Item = z.object({
    id: z.string(),
    title: z.string(),
    tier: z.string(),
    unlocked_at: z.string(),
});

const PublicResponseSchema = z.object({
    user_id: z.string(),
    achievements: z.array(Item),
    pinned: z.array(z.string()),
});

const ALL_DEFS = Object.values(RULES_BY_ID).map((r) => ({
    id: r.def.id,
    title: r.def.title,
    description: r.def.description,
    category: r.def.category,
    tier: r.def.tier,
    hidden: r.def.hidden,
    xp: r.def.xp,
}));

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireProgressionEnabled();
    const userId = ctx.pathParameters.userId;
    if (!userId) throw Errors.BadRequest("userId required");
    try {
        const result = await queryBus.execute(
            new ListPublicAchievementsQuery(userId, ALL_DEFS),
        );
        return PublicResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
