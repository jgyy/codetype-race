import {
    dailyRotationId,
    pickDailyQuests,
    pickWeeklyQuests,
    weeklyRotationId,
} from "@codetype/shared/progression/quests";
import { quests } from "../src/repos/QuestsRepo";

/**
 * Daily quest rotation. Runs at 00:00 UTC.
 *
 * - Picks 3 daily quests deterministically from `daily:<YYYY-MM-DD>`.
 * - On Mondays (UTC), also seeds the new weekly rotation with 1 quest.
 *
 * The repo's `seedRotation` is idempotent (attribute_not_exists on SK),
 * so a retry or duplicate cron firing is harmless.
 */
export async function rotateQuests(now: Date = new Date()): Promise<{
    daily: { rotationId: string; written: number };
    weekly?: { rotationId: string; written: number };
}> {
    const daily = dailyRotationId(now);
    const weekly = weeklyRotationId(now);
    const dResult = await quests.seedRotation(
        "daily",
        daily,
        pickDailyQuests(daily, 3),
    );
    const isMonday = now.getUTCDay() === 1;
    let wResult: { rotationId: string; written: number } | undefined;
    if (isMonday) {
        const w = await quests.seedRotation(
            "weekly",
            weekly,
            pickWeeklyQuests(weekly, 1),
        );
        wResult = { rotationId: weekly, written: w.written };
    }
    return {
        daily: { rotationId: daily, written: dResult.written },
        weekly: wResult,
    };
}

export const handler = async () => {
    const start = Date.now();
    const result = await rotateQuests();
    console.log(
        JSON.stringify({
            feature: "progression",
            route: "cron:rotateQuests",
            status: 200,
            ms: Date.now() - start,
            ...result,
        }),
    );
};
