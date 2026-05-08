import { z } from "zod";
import { withHttp } from "../../src/middleware";
import { Errors, requireProgressionEnabled } from "../../src/AppError";
import { xp } from "../../src/repos/XpRepo";
import { levelFor } from "@codetype/shared/progression/xp";

const EmptyBody = z.object({}).passthrough();

const XpSummaryResponseSchema = z.object({
    total_xp: z.number().int().nonnegative(),
    level: z.number().int().min(1),
    current_level_xp: z.number().int().nonnegative(),
    next_level_xp: z.number().int().nonnegative(),
    last_race_date: z.string().optional(),
});

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireProgressionEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();

    const summary = await xp.getSummary(ctx.userId);
    if (!summary) {
        const seed = levelFor(0);
        return XpSummaryResponseSchema.parse({
            total_xp: seed.totalXp,
            level: seed.level,
            current_level_xp: seed.currentLevelXp,
            next_level_xp: seed.nextLevelXp,
        });
    }
    return XpSummaryResponseSchema.parse({
        total_xp: summary.totalXp,
        level: summary.level,
        current_level_xp: summary.currentLevelXp,
        next_level_xp: summary.nextLevelXp,
        last_race_date: summary.lastRaceDate,
    });
});
