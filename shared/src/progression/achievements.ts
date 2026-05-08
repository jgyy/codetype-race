import { z } from "zod";
import type { EventEnvelope } from "../eventlog";

export const AchievementCategorySchema = z.enum([
    "consistency",
    "accuracy",
    "languages",
    "social",
    "speed",
    "events",
    "meta",
]);
export type AchievementCategory = z.infer<typeof AchievementCategorySchema>;

export const AchievementTierSchema = z.enum([
    "bronze",
    "silver",
    "gold",
    "platinum",
]);
export type AchievementTier = z.infer<typeof AchievementTierSchema>;

export const AchievementDefSchema = z.object({
    id: z.string().regex(/^[a-z0-9_]{3,40}$/),
    title: z.string().min(3).max(60),
    description: z.string().min(3).max(200),
    category: AchievementCategorySchema,
    tier: AchievementTierSchema,
    hidden: z.boolean().default(false),
    xp: z.number().int().nonnegative().default(5),
    unlisted: z.boolean().default(false),
});
export type AchievementDef = z.infer<typeof AchievementDefSchema>;

/**
 * Aggregated player state used by stateful rules. Loaded lazily by the
 * engine and cached for the lifetime of a stream batch.
 *
 * Fields are sourced from existing rows (no new write path), which is
 * why best_wpm is keyed by language — that matches what UserRepo
 * already persists on race finalization.
 */
export interface PlayerState {
    totalRaces: number;
    racesWon: number;
    bestWpmByLang: Record<string, number>;
    bestWpm: number;
    langsRaced: string[];
}

export interface AchievementRule {
    def: AchievementDef;
    match: (env: EventEnvelope, state?: PlayerState) => boolean;
}

export const UnlockedAchievementSchema = z.object({
    achievement_id: z.string(),
    unlocked_at: z.string().datetime(),
    xp_awarded: z.number().int().nonnegative(),
});
export type UnlockedAchievement = z.infer<typeof UnlockedAchievementSchema>;

export const PinnedAchievementsRequestSchema = z.object({
    slots: z.array(z.string()).max(6),
});
export type PinnedAchievementsRequest = z.infer<
    typeof PinnedAchievementsRequestSchema
>;
