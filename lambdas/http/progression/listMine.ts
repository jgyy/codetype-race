import { z } from "zod";
import { withHttp } from "../../src/middleware";
import { Errors, requireProgressionEnabled } from "../../src/AppError";
import { achievements } from "../../src/repos/AchievementsRepo";
import { RULES_BY_ID } from "@codetype/shared/progression/rules";

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

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireProgressionEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();

    const [unlocked, pinned] = await Promise.all([
        achievements.listForUser(ctx.userId),
        achievements.listPinned(ctx.userId),
    ]);
    const unlockedById = new Map(unlocked.map((u) => [u.achievement_id, u]));

    const items = Object.values(RULES_BY_ID)
        .filter((r) => !r.def.hidden || unlockedById.has(r.def.id))
        .map((r) => {
            const u = unlockedById.get(r.def.id);
            return {
                id: r.def.id,
                title: r.def.title,
                description: r.def.description,
                category: r.def.category,
                tier: r.def.tier,
                unlocked: !!u,
                unlocked_at: u?.unlocked_at,
                xp_awarded: u?.xp_awarded,
            };
        });

    return ListMineResponseSchema.parse({ achievements: items, pinned });
});
