import type { EventEnvelope } from "@codetype/shared/eventlog";
import {
    ALL_QUEST_DEFS,
    dailyRotationId,
    progressDeltasForEvent,
    weeklyRotationId,
    type QuestDef,
} from "@codetype/shared/progression/quests";
import { quests as defaultRepo, type QuestsRepo } from "../repos/QuestsRepo";

interface QuestRunResult {
    questId: string;
    rotationId: string;
    progress: number;
    completed: boolean;
}

/**
 * For each event we evaluate against *currently active* quests for both
 * daily and weekly rotations derived from the envelope's occurredAt.
 * Active rows must already exist (seeded by the rotation cron).
 */
export async function runQuestsForEnvelope(
    env: EventEnvelope,
    deps: { repo?: QuestsRepo } = {},
): Promise<QuestRunResult[]> {
    const repo = deps.repo ?? defaultRepo;
    const occurred = new Date(env.occurredAt);
    const daily = dailyRotationId(occurred);
    const weekly = weeklyRotationId(occurred);

    const [activeDaily, activeWeekly] = await Promise.all([
        repo.listActive("daily", daily).catch(() => []),
        repo.listActive("weekly", weekly).catch(() => []),
    ]);

    const out: QuestRunResult[] = [];
    const apply = async (
        rotationId: string,
        active: { quest_id: string }[],
    ) => {
        const defs = active
            .map((a) => ALL_QUEST_DEFS[a.quest_id])
            .filter((d): d is QuestDef => !!d);
        const deltas = progressDeltasForEvent(env, defs);
        for (const d of deltas) {
            const def = ALL_QUEST_DEFS[d.questId]!;
            try {
                const r = await repo.addProgress(
                    env.userId,
                    rotationId,
                    def,
                    d.delta,
                );
                if (r) {
                    out.push({
                        questId: def.id,
                        rotationId,
                        progress: r.progress,
                        completed: r.completed,
                    });
                }
            } catch (e) {
                console.log(
                    JSON.stringify({
                        quest_progress_failed: {
                            userId: env.userId,
                            quest: def.id,
                            err: String(e),
                        },
                    }),
                );
            }
        }
    };
    await apply(daily, activeDaily);
    await apply(weekly, activeWeekly);
    return out;
}
