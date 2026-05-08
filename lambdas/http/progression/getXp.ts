import { z } from "zod";
import { levelFor } from "@codetype/shared/progression/xp";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireProgressionEnabled } from "../../src/AppError";
import { GetXpSummaryQuery, queryBus } from "../_container";

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
    const seed = levelFor(0);
    try {
        const result = await queryBus.execute(
            new GetXpSummaryQuery(ctx.userId, {
                totalXp: seed.totalXp,
                level: seed.level,
                currentLevelXp: seed.currentLevelXp,
                nextLevelXp: seed.nextLevelXp,
            }),
        );
        return XpSummaryResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
