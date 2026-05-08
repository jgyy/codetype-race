import type { EventEnvelope } from "@codetype/shared/eventlog";
import {
    XP_DAILY_CHALLENGE,
    XP_RACE_BASE,
    XP_TOURN_ROUND_WIN,
} from "@codetype/shared/progression/xp";
import { xp as xpRepo, type XpRepo } from "../repos/XpRepo";

export interface XpAwardOutcome {
    userId: string;
    type: EventEnvelope["type"];
    delta: number;
    bonusDelta: number;
    totalXp: number;
    level: number;
    leveledUp: boolean;
}

export function baseDeltaFor(env: EventEnvelope): number {
    switch (env.type) {
        case "RACE_FINISHED":
            return XP_RACE_BASE;
        case "DAILY_DONE":
            return XP_DAILY_CHALLENGE;
        case "TOURN_WON":
            return XP_TOURN_ROUND_WIN;
        default:
            return 0;
    }
}

/**
 * Best-effort XP award. Errors are logged and swallowed so the stream
 * batch doesn't block on transient progression failures.
 */
export async function awardForEnvelope(
    env: EventEnvelope,
    repo: XpRepo = xpRepo,
): Promise<XpAwardOutcome | null> {
    const base = baseDeltaFor(env);
    if (base <= 0) return null;
    try {
        const before = await repo.getSummary(env.userId);
        const beforeLevel = before?.level ?? 1;
        const r = await repo.award(env, base, {
            bonusOnFirstRaceOfDay: env.type === "RACE_FINISHED",
        });
        if (r.deduped) {
            return {
                userId: env.userId,
                type: env.type,
                delta: 0,
                bonusDelta: 0,
                totalXp: r.summary.totalXp,
                level: r.summary.level,
                leveledUp: false,
            };
        }
        return {
            userId: env.userId,
            type: env.type,
            delta: r.delta,
            bonusDelta: r.bonusDelta,
            totalXp: r.summary.totalXp,
            level: r.summary.level,
            leveledUp: r.summary.level > beforeLevel,
        };
    } catch (e) {
        console.log(
            JSON.stringify({
                xp_award_failed: {
                    userId: env.userId,
                    type: env.type,
                    err: String(e),
                },
            }),
        );
        return null;
    }
}
