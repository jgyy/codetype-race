export const MAX_LEVEL = 60;

export function xpForLevel(level: number): number {
    if (level < 1) return 0;
    return Math.floor(100 * Math.pow(level, 1.5));
}

const CUMULATIVE_XP: number[] = (() => {
    const out: number[] = [0];
    let cum = 0;
    for (let lv = 1; lv < MAX_LEVEL; lv++) {
        cum += xpForLevel(lv);
        out.push(cum);
    }
    return out;
})();

export interface XpBreakdown {
    level: number;
    currentLevelXp: number;
    nextLevelXp: number;
    totalXp: number;
}

export function levelFor(totalXp: number): XpBreakdown {
    const t = Math.max(0, Math.floor(totalXp));
    let level = 1;
    for (let lv = 1; lv < MAX_LEVEL; lv++) {
        if (CUMULATIVE_XP[lv] > t) {
            level = lv;
            return {
                level,
                currentLevelXp: t - CUMULATIVE_XP[lv - 1]!,
                nextLevelXp: xpForLevel(lv),
                totalXp: t,
            };
        }
    }
    return {
        level: MAX_LEVEL,
        currentLevelXp: t - CUMULATIVE_XP[MAX_LEVEL - 1]!,
        nextLevelXp: 0,
        totalXp: t,
    };
}

export const XP_RACE_BASE = 10;
export const XP_FIRST_RACE_DAY_BONUS = 20;
export const XP_DAILY_CHALLENGE = 30;
export const XP_TOURN_ROUND_WIN = 50;
export const XP_ACHIEVEMENT_DEFAULT = 5;
