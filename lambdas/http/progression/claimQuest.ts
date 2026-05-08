import { z } from "zod";
import { DomainError } from "@codetype/domain";
import {
    ALL_QUEST_DEFS,
    dailyRotationId,
    weeklyRotationId,
} from "@codetype/shared/progression/quests";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireProgressionEnabled } from "../../src/AppError";
import { ClaimQuestCommand, commandBus } from "../_container";

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

    try {
        const result = await commandBus.dispatch(
            new ClaimQuestCommand({
                userId: ctx.userId,
                rotationId,
                def: { id: def.id, target: def.target, xp: def.xp },
            }),
        );
        return Response.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
