import { z } from "zod";
import type { EventEnvelope } from "../eventlog";

export const QuestPeriodSchema = z.enum(["daily", "weekly"]);
export type QuestPeriod = z.infer<typeof QuestPeriodSchema>;

export const QuestRuleKindSchema = z.enum([
    "races_completed",
    "wpm_threshold",
    "accuracy_threshold",
    "language_specific",
    "daily_challenge_done",
    "tournament_round",
]);
export type QuestRuleKind = z.infer<typeof QuestRuleKindSchema>;

export const QuestDefSchema = z.object({
    id: z.string().regex(/^[a-z0-9_]{3,40}$/),
    period: QuestPeriodSchema,
    title: z.string().min(3).max(80),
    description: z.string().min(3).max(200),
    ruleKind: QuestRuleKindSchema,
    target: z.number().int().positive(),
    threshold: z.number().optional(),
    language: z.string().optional(),
    xp: z.number().int().positive(),
});
export type QuestDef = z.infer<typeof QuestDefSchema>;

export const QuestProgressRowSchema = z.object({
    rotation_id: z.string(),
    quest_id: z.string(),
    progress: z.number().int().nonnegative(),
    target: z.number().int().positive(),
    claimed: z.boolean(),
    claimed_at: z.string().datetime().optional(),
});
export type QuestProgressRow = z.infer<typeof QuestProgressRowSchema>;

const def = (q: QuestDef): QuestDef => q;

export const DAILY_POOL: QuestDef[] = [
    def({
        id: "daily_3_races",
        period: "daily",
        title: "Warm-Up",
        description: "Finish 3 races today.",
        ruleKind: "races_completed",
        target: 3,
        xp: 30,
    }),
    def({
        id: "daily_5_races",
        period: "daily",
        title: "Practice Hour",
        description: "Finish 5 races today.",
        ruleKind: "races_completed",
        target: 5,
        xp: 50,
    }),
    def({
        id: "daily_wpm_60",
        period: "daily",
        title: "Steady Hands",
        description: "Score 60+ WPM in a race.",
        ruleKind: "wpm_threshold",
        target: 1,
        threshold: 60,
        xp: 30,
    }),
    def({
        id: "daily_wpm_80",
        period: "daily",
        title: "Quick Fingers",
        description: "Score 80+ WPM in a race.",
        ruleKind: "wpm_threshold",
        target: 1,
        threshold: 80,
        xp: 50,
    }),
    def({
        id: "daily_acc_95",
        period: "daily",
        title: "Steady Aim",
        description: "Finish a race with 95%+ accuracy.",
        ruleKind: "accuracy_threshold",
        target: 1,
        threshold: 0.95,
        xp: 30,
    }),
    def({
        id: "daily_typescript",
        period: "daily",
        title: "Strongly Typed",
        description: "Finish a TypeScript race.",
        ruleKind: "language_specific",
        target: 1,
        language: "typescript",
        xp: 30,
    }),
    def({
        id: "daily_python",
        period: "daily",
        title: "Pythonic",
        description: "Finish a Python race.",
        ruleKind: "language_specific",
        target: 1,
        language: "python",
        xp: 30,
    }),
    def({
        id: "daily_challenge",
        period: "daily",
        title: "Daily Challenge",
        description: "Complete today's daily challenge.",
        ruleKind: "daily_challenge_done",
        target: 1,
        xp: 50,
    }),
];

export const WEEKLY_POOL: QuestDef[] = [
    def({
        id: "weekly_25_races",
        period: "weekly",
        title: "Iron Resolve",
        description: "Finish 25 races this week.",
        ruleKind: "races_completed",
        target: 25,
        xp: 200,
    }),
    def({
        id: "weekly_wpm_100",
        period: "weekly",
        title: "Triple Digit",
        description: "Score 100+ WPM in a race.",
        ruleKind: "wpm_threshold",
        target: 1,
        threshold: 100,
        xp: 200,
    }),
    def({
        id: "weekly_acc_99",
        period: "weekly",
        title: "Sniper",
        description: "Finish a race with 99%+ accuracy.",
        ruleKind: "accuracy_threshold",
        target: 1,
        threshold: 0.99,
        xp: 200,
    }),
    def({
        id: "weekly_tournament",
        period: "weekly",
        title: "Bracket Survivor",
        description: "Win a tournament round.",
        ruleKind: "tournament_round",
        target: 1,
        xp: 200,
    }),
];

function fnv1a(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

export function pickN<T extends { id: string }>(
    seed: string,
    pool: readonly T[],
    n: number,
): T[] {
    if (n >= pool.length) return [...pool];
    const indexed = pool.map((item, i) => ({
        item,
        rank: fnv1a(`${seed}#${i}#${item.id}`),
    }));
    indexed.sort((a, b) =>
        a.rank === b.rank ? a.item.id.localeCompare(b.item.id) : a.rank - b.rank,
    );
    return indexed.slice(0, n).map((x) => x.item);
}

export function dailyRotationId(d: Date = new Date()): string {
    return d.toISOString().slice(0, 10);
}

export function weeklyRotationId(d: Date = new Date()): string {
    const t = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
    const dayOfWeek = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dayOfWeek + 3);
    const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const week =
        1 +
        Math.round(
            ((t.getTime() - firstThu.getTime()) / 86400000 -
                3 +
                ((firstThu.getUTCDay() + 6) % 7)) /
            7,
        );
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function pickDailyQuests(rotationId: string, n = 3): QuestDef[] {
    return pickN(`daily:${rotationId}`, DAILY_POOL, n);
}

export function pickWeeklyQuests(rotationId: string, n = 1): QuestDef[] {
    return pickN(`weekly:${rotationId}`, WEEKLY_POOL, n);
}

export interface QuestProgressDelta {
    questId: string;
    delta: number;
}

export function progressDeltasForEvent(
    env: EventEnvelope,
    activeQuests: readonly QuestDef[],
): QuestProgressDelta[] {
    const out: QuestProgressDelta[] = [];
    for (const q of activeQuests) {
        const delta = deltaForQuest(env, q);
        if (delta > 0) out.push({ questId: q.id, delta });
    }
    return out;
}

function deltaForQuest(env: EventEnvelope, q: QuestDef): number {
    const p = env.payload as Record<string, unknown>;
    switch (q.ruleKind) {
        case "races_completed":
            return env.type === "RACE_FINISHED" ? 1 : 0;
        case "wpm_threshold":
            return env.type === "RACE_FINISHED" &&
                Number(p.wpm ?? 0) >= (q.threshold ?? Infinity)
                ? 1
                : 0;
        case "accuracy_threshold":
            return env.type === "RACE_FINISHED" &&
                Number(p.accuracy ?? 0) >= (q.threshold ?? Infinity)
                ? 1
                : 0;
        case "language_specific":
            return env.type === "RACE_FINISHED" && p.language === q.language
                ? 1
                : 0;
        case "daily_challenge_done":
            return env.type === "DAILY_DONE" ? 1 : 0;
        case "tournament_round":
            return env.type === "TOURN_WON" ? 1 : 0;
        default:
            return 0;
    }
}

export const ALL_QUEST_DEFS: Record<string, QuestDef> = Object.fromEntries(
    [...DAILY_POOL, ...WEEKLY_POOL].map((q) => [q.id, q]),
);
