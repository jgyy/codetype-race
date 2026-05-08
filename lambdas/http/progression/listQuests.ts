import { z } from "zod";
import {
    ALL_QUEST_DEFS,
    dailyRotationId,
    weeklyRotationId,
} from "@codetype/shared/progression/quests";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireProgressionEnabled } from "../../src/AppError";
import { ListQuestsQuery, queryBus } from "../_container";

const EmptyBody = z.object({}).passthrough();

const QuestItem = z.object({
    id: z.string(),
    period: z.enum(["daily", "weekly"]),
    rotation_id: z.string(),
    title: z.string(),
    description: z.string(),
    target: z.number().int(),
    progress: z.number().int(),
    claimed: z.boolean(),
    xp: z.number().int(),
});

const Response = z.object({ quests: z.array(QuestItem) });

const QUEST_DEFS_LITE = Object.fromEntries(
    Object.entries(ALL_QUEST_DEFS).map(([k, def]) => [
        k,
        {
            id: def.id,
            period: def.period,
            title: def.title,
            description: def.description,
            target: def.target,
            xp: def.xp,
        },
    ]),
);

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireProgressionEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const now = new Date();
    try {
        const result = await queryBus.execute(
            new ListQuestsQuery({
                userId: ctx.userId,
                dailyRotationId: dailyRotationId(now),
                weeklyRotationId: weeklyRotationId(now),
                questDefs: QUEST_DEFS_LITE,
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
