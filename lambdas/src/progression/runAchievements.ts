import type { EventEnvelope } from "@codetype/shared/eventlog";
import type { PlayerState } from "@codetype/shared/progression/achievements";
import { ALL_RULES } from "@codetype/shared/progression/rules";
import {
    achievements as defaultRepo,
    type AchievementsRepo,
} from "../repos/AchievementsRepo";
import { xp as defaultXp, type XpRepo } from "../repos/XpRepo";
import { loadPlayerState } from "./playerState";

export interface UnlockOutcome {
    userId: string;
    achievementId: string;
    xpAwarded: number;
}

/**
 * Evaluate all rules against an envelope. For each match, attempt an
 * idempotent unlock; on a *new* unlock, award +xp via the XP ledger.
 *
 * Best-effort: errors are logged and swallowed so a malformed event
 * cannot stall the stream batch.
 */
export async function runAchievementsForEnvelope(
    env: EventEnvelope,
    deps: {
        repo?: AchievementsRepo;
        xpRepo?: XpRepo;
        loadState?: (userId: string) => Promise<PlayerState>;
    } = {},
): Promise<UnlockOutcome[]> {
    const repo = deps.repo ?? defaultRepo;
    const xpRepo = deps.xpRepo ?? defaultXp;
    const loadState = deps.loadState ?? loadPlayerState;
    const needsState = ALL_RULES.some((r) => r.match.length >= 2);
    const state: PlayerState | undefined = needsState
        ? await loadState(env.userId).catch(() => undefined)
        : undefined;
    const matched = ALL_RULES.filter((r) => {
        try {
            return r.match(env, state);
        } catch (e) {
            console.log(
                JSON.stringify({
                    rule_match_failed: { rule: r.def.id, err: String(e) },
                }),
            );
            return false;
        }
    });
    if (matched.length === 0) return [];

    const out: UnlockOutcome[] = [];
    for (const rule of matched) {
        try {
            const wrote = await repo.tryUnlock(
                env.userId,
                rule.def,
                env.occurredAt,
            );
            if (!wrote) continue;
            if (rule.def.xp > 0) {
                const bonusEnv: EventEnvelope = {
                    ...env,
                    id: `${env.id}:ach:${rule.def.id}`,
                    type: "ACHIEVEMENT_UNLOCKED",
                    payload: { achievement_id: rule.def.id },
                };
                await xpRepo.award(bonusEnv, rule.def.xp, {});
            }
            out.push({
                userId: env.userId,
                achievementId: rule.def.id,
                xpAwarded: rule.def.xp,
            });
        } catch (e) {
            console.log(
                JSON.stringify({
                    achievement_unlock_failed: {
                        rule: rule.def.id,
                        userId: env.userId,
                        err: String(e),
                    },
                }),
            );
        }
    }
    return out;
}
