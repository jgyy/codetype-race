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

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireProgressionEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();

    const now = new Date();
    const daily = dailyRotationId(now);
    const weekly = weeklyRotationId(now);

    const [dailyActive, weeklyActive, dailyProg, weeklyProg] =
        await Promise.all([
            quests.listActive("daily", daily),
            quests.listActive("weekly", weekly),
            quests.getProgressMap(ctx.userId, daily),
            quests.getProgressMap(ctx.userId, weekly),
        ]);

    const items = [
        ...dailyActive.map((a) => buildItem(a.quest_id, daily, dailyProg)),
        ...weeklyActive.map((a) => buildItem(a.quest_id, weekly, weeklyProg)),
    ].filter((x): x is NonNullable<typeof x> => x !== null);

    return Response.parse({ quests: items });
});

function buildItem(
    questId: string,
    rotationId: string,
    progress: Map<string, { progress: number; claimed: boolean }>,
) {
    const def = ALL_QUEST_DEFS[questId];
    if (!def) return null;
    const p = progress.get(questId);
    return {
        id: def.id,
        period: def.period,
        rotation_id: rotationId,
        title: def.title,
        description: def.description,
        target: def.target,
        progress: p?.progress ?? 0,
        claimed: p?.claimed ?? false,
        xp: def.xp,
    };
}
