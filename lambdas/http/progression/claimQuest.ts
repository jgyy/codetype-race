import { z } from "zod";
import { withHttp } from "../../src/middleware";
import { Errors, requireProgressionEnabled } from "../../src/AppError";
import { quests } from "../../src/repos/QuestsRepo";
import {
    ALL_QUEST_DEFS,
    dailyRotationId,
    weeklyRotationId,
} from "@codetype/shared/progression/quests";

const EmptyBody = z.object({}).passthrough();

const Response = z.object({
    claimed: z.boolean(),
    quest_id: z.string(),
    xp_awarded: z.number().int().nonnegative(),
});

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireProgressionEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const questId = ctx.pathParameters.questId;
    if (!questId) throw Errors.BadRequest("questId required");
    const def = ALL_QUEST_DEFS[questId];
    if (!def) throw Errors.NotFound("quest");

    const rotationId =
        def.period === "daily"
            ? dailyRotationId(new Date())
            : weeklyRotationId(new Date());
    const progress = await quests.getProgress(ctx.userId, rotationId, def.id);
    if (!progress) throw Errors.NotFound("quest progress");
    if (progress.claimed) {
        throw Errors.Conflict("already claimed");
    }
    if (progress.progress < def.target) {
        throw Errors.Conflict("quest not complete");
    }

    const ok = await quests.claim(ctx.userId, rotationId, def);
    if (!ok) {
        throw Errors.Conflict("claim conflicted");
    }
    return Response.parse({
        claimed: true,
        quest_id: def.id,
        xp_awarded: def.xp,
    });
});
