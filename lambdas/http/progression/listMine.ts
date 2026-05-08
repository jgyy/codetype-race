import { z } from "zod";
import { RULES_BY_ID } from "@codetype/shared/progression/rules";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireProgressionEnabled } from "../../src/AppError";
import { ListMyAchievementsQuery, queryBus } from "../_container";

const EmptyBody = z.object({}).passthrough();

const Item = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.string(),
    tier: z.string(),
    unlocked: z.boolean(),
    unlocked_at: z.string().optional(),
    xp_awarded: z.number().int().optional(),
});

const ListMineResponseSchema = z.object({
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
    if (!ctx.userId) throw Errors.Unauthorized();
    try {
        const result = await queryBus.execute(
            new ListMyAchievementsQuery(ctx.userId, ALL_DEFS),
        );
        return ListMineResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
