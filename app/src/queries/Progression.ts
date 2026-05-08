import { DomainError } from "@codetype/domain";
import { Query, type QueryHandler } from "../bus/Command";

/* ------------------- shared sinks + lite types ------------------------- */

export interface AchievementDef {
    id: string;
    title: string;
    description: string;
    category: string;
    tier: string;
    hidden: boolean;
    xp: number;
}

export interface AchievementUnlock {
    achievement_id: string;
    unlocked_at: string;
    xp_awarded?: number;
}

export interface AchievementsReadsSink {
    listForUser(userId: string): Promise<AchievementUnlock[]>;
    listPinned(userId: string): Promise<string[]>;
}

export interface XpReadsSink {
    getSummary(userId: string): Promise<XpSummary | null>;
}

export interface XpSummary {
    totalXp: number;
    level: number;
    currentLevelXp: number;
    nextLevelXp: number;
    lastRaceDate?: string;
}

export interface QuestDef {
    id: string;
    period: "daily" | "weekly";
    title: string;
    description: string;
    target: number;
    xp: number;
}

export interface QuestProgress {
    progress: number;
    claimed: boolean;
}

export interface QuestsReadsSink {
    listActive(period: "daily" | "weekly", rotationId: string): Promise<Array<{ quest_id: string }>>;
    getProgressMap(userId: string, rotationId: string): Promise<Map<string, QuestProgress>>;
}

/* ------------------- GetAchievementCatalog ---------------------------- */

export interface CatalogItem {
    id: string;
    title: string;
    description: string;
    category: string;
    tier: string;
    hidden: boolean;
    xp: number;
}

export class GetAchievementCatalogQuery extends Query<{ achievements: CatalogItem[] }> {
    /** Edge passes the resolved rule defs so app/ stays free of @codetype/shared. */
    constructor(public readonly rules: AchievementDef[]) {
        super();
    }
}

export class GetAchievementCatalogHandler
    implements QueryHandler<GetAchievementCatalogQuery> {
    async execute(q: GetAchievementCatalogQuery) {
        const items = q.rules
            .filter((r) => !r.hidden)
            .map((r) => ({ ...r }));
        return { achievements: items };
    }
}

/* ------------------- GetXpSummary ------------------------------------ */

export interface GetXpSummaryResult {
    total_xp: number;
    level: number;
    current_level_xp: number;
    next_level_xp: number;
    last_race_date?: string;
}

export class GetXpSummaryQuery extends Query<GetXpSummaryResult> {
    constructor(
        public readonly userId: string,
        /** Edge passes the seed (level/totalXp/etc. for 0 XP) computed from levelFor(). */
        public readonly seedForZero: XpSummary,
    ) {
        super();
    }
}

export class GetXpSummaryHandler implements QueryHandler<GetXpSummaryQuery> {
    constructor(private readonly xp: XpReadsSink) { }
    async execute(q: GetXpSummaryQuery): Promise<GetXpSummaryResult> {
        const summary = await this.xp.getSummary(q.userId) ?? q.seedForZero;
        return {
            total_xp: summary.totalXp,
            level: summary.level,
            current_level_xp: summary.currentLevelXp,
            next_level_xp: summary.nextLevelXp,
            last_race_date: summary.lastRaceDate,
        };
    }
}

/* ------------------- ListMyAchievements ------------------------------ */

export interface MyAchievementItem {
    id: string;
    title: string;
    description: string;
    category: string;
    tier: string;
    unlocked: boolean;
    unlocked_at?: string;
    xp_awarded?: number;
}

export class ListMyAchievementsQuery extends Query<{
    achievements: MyAchievementItem[];
    pinned: string[];
}> {
    constructor(
        public readonly userId: string,
        public readonly rules: AchievementDef[],
    ) {
        super();
    }
}

export class ListMyAchievementsHandler
    implements QueryHandler<ListMyAchievementsQuery> {
    constructor(private readonly achievements: AchievementsReadsSink) { }
    async execute(q: ListMyAchievementsQuery) {
        const [unlocked, pinned] = await Promise.all([
            this.achievements.listForUser(q.userId),
            this.achievements.listPinned(q.userId),
        ]);
        const unlockedById = new Map(
            unlocked.map((u) => [u.achievement_id, u]),
        );
        const items = q.rules
            .filter((r) => !r.hidden || unlockedById.has(r.id))
            .map((r) => {
                const u = unlockedById.get(r.id);
                return {
                    id: r.id,
                    title: r.title,
                    description: r.description,
                    category: r.category,
                    tier: r.tier,
                    unlocked: !!u,
                    unlocked_at: u?.unlocked_at,
                    xp_awarded: u?.xp_awarded,
                };
            });
        return { achievements: items, pinned };
    }
}

/* ------------------- ListPublicAchievements --------------------------- */

export interface PublicAchievementItem {
    id: string;
    title: string;
    tier: string;
    unlocked_at: string;
}

export class ListPublicAchievementsQuery extends Query<{
    user_id: string;
    achievements: PublicAchievementItem[];
    pinned: string[];
}> {
    constructor(
        public readonly userId: string,
        public readonly rules: AchievementDef[],
    ) {
        super();
    }
}

export class ListPublicAchievementsHandler
    implements QueryHandler<ListPublicAchievementsQuery> {
    constructor(private readonly achievements: AchievementsReadsSink) { }
    async execute(q: ListPublicAchievementsQuery) {
        const [unlocked, pinned] = await Promise.all([
            this.achievements.listForUser(q.userId),
            this.achievements.listPinned(q.userId),
        ]);
        const byId = new Map(q.rules.map((r) => [r.id, r]));
        const items = unlocked
            .map((u) => {
                const def = byId.get(u.achievement_id);
                if (!def || def.hidden) return null;
                return {
                    id: def.id,
                    title: def.title,
                    tier: def.tier,
                    unlocked_at: u.unlocked_at,
                };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);
        return { user_id: q.userId, achievements: items, pinned };
    }
}

/* ------------------- ListQuests --------------------------------------- */

export interface QuestItemOut {
    id: string;
    period: "daily" | "weekly";
    rotation_id: string;
    title: string;
    description: string;
    target: number;
    progress: number;
    claimed: boolean;
    xp: number;
}

export interface ListQuestsInput {
    userId: string;
    dailyRotationId: string;
    weeklyRotationId: string;
    /** Edge passes the resolved quest-def map keyed by id. */
    questDefs: Record<string, QuestDef>;
}

export class ListQuestsQuery extends Query<{ quests: QuestItemOut[] }> {
    constructor(public readonly input: ListQuestsInput) {
        super();
    }
}

export class ListQuestsHandler implements QueryHandler<ListQuestsQuery> {
    constructor(private readonly quests: QuestsReadsSink) { }

    async execute(q: ListQuestsQuery) {
        const { userId, dailyRotationId, weeklyRotationId, questDefs } = q.input;
        const [dailyActive, weeklyActive, dailyProg, weeklyProg] =
            await Promise.all([
                this.quests.listActive("daily", dailyRotationId),
                this.quests.listActive("weekly", weeklyRotationId),
                this.quests.getProgressMap(userId, dailyRotationId),
                this.quests.getProgressMap(userId, weeklyRotationId),
            ]);

        const buildItem = (
            questId: string,
            rotationId: string,
            progress: Map<string, QuestProgress>,
        ): QuestItemOut | null => {
            const def = questDefs[questId];
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
        };

        const items = [
            ...dailyActive.map((a) => buildItem(a.quest_id, dailyRotationId, dailyProg)),
            ...weeklyActive.map((a) => buildItem(a.quest_id, weeklyRotationId, weeklyProg)),
        ].filter((x): x is QuestItemOut => x !== null);

        return { quests: items };
    }

    /**
     * Imported here only as a type-domain marker — kept for future schema
     * checks. Does not actually fail compilation if removed.
     */
    static readonly _domainErrorMarker = DomainError;
}
