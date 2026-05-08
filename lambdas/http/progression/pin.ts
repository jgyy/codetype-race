import { withHttp } from "../../src/middleware";
import { Errors, requireProgressionEnabled } from "../../src/AppError";
import { achievements } from "../../src/repos/AchievementsRepo";
import {
    PinnedAchievementsRequestSchema,
} from "@codetype/shared/progression/achievements";
import { RULES_BY_ID } from "@codetype/shared/progression/rules";

export const handler = withHttp(
    PinnedAchievementsRequestSchema,
    async (input, ctx) => {
        requireProgressionEnabled();
        if (!ctx.userId) throw Errors.Unauthorized();

        const owned = new Set(
            (await achievements.listForUser(ctx.userId)).map(
                (u) => u.achievement_id,
            ),
        );
        for (const id of input.slots) {
            if (!RULES_BY_ID[id]) {
                throw Errors.BadRequest(`unknown achievement: ${id}`);
            }
            if (!owned.has(id)) {
                throw Errors.Conflict(`not unlocked: ${id}`);
            }
        }
        if (new Set(input.slots).size !== input.slots.length) {
            throw Errors.BadRequest("duplicate slot ids");
        }

        await achievements.setPinned(ctx.userId, input.slots);
        return { pinned: input.slots };
    },
);
