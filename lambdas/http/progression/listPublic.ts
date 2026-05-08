import { z } from "zod";
import { withHttp } from "../../src/middleware";
import { Errors, requireProgressionEnabled } from "../../src/AppError";
import { achievements } from "../../src/repos/AchievementsRepo";
import { RULES_BY_ID } from "@codetype/shared/progression/rules";

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

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireProgressionEnabled();
    const userId = ctx.pathParameters.userId;
    if (!userId) throw Errors.BadRequest("userId required");

    const [unlocked, pinned] = await Promise.all([
        achievements.listForUser(userId),
        achievements.listPinned(userId),
    ]);
    const items = unlocked
        .map((u) => {
            const def = RULES_BY_ID[u.achievement_id]?.def;
            if (!def || def.hidden) return null;
            return {
                id: def.id,
                title: def.title,
                tier: def.tier,
                unlocked_at: u.unlocked_at,
            };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

    return PublicResponseSchema.parse({
        user_id: userId,
        achievements: items,
        pinned,
    });
});
