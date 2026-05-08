import { DomainError } from "@codetype/domain";
import { Query, type QueryHandler } from "../bus/Command";

export interface SeasonRow {
    id: string;
    startsAt: string;
    endsAt: string;
    [k: string]: unknown;
}

export interface SeasonsReadsSink {
    listByStatus(status: "active" | "finished"): Promise<SeasonRow[]>;
    get(id: string): Promise<SeasonRow | null>;
    getLeaderboard(id: string, lang: string, limit: number): Promise<unknown[]>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/* ------------------- GetCurrentSeason --------------------------------- */

export class GetCurrentSeasonQuery extends Query<{
    season: SeasonRow | null;
    daysRemaining: number | null;
}> {
    constructor(public readonly nowEpochMs: number) {
        super();
    }
}

export class GetCurrentSeasonHandler
    implements QueryHandler<GetCurrentSeasonQuery> {
    constructor(private readonly seasons: SeasonsReadsSink) { }
    async execute(q: GetCurrentSeasonQuery) {
        const active = await this.seasons.listByStatus("active");
        if (active.length === 0) return { season: null, daysRemaining: null };
        active.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
        const season = active[0]!;
        const remainingMs = new Date(season.endsAt).getTime() - q.nowEpochMs;
        const daysRemaining = Math.max(0, Math.ceil(remainingMs / DAY_MS));
        return { season, daysRemaining };
    }
}

/* ------------------- GetSeasonLeaderboard ----------------------------- */

export interface GetSeasonLeaderboardInput {
    id: string;
    lang: string;
    limit: number;
}

export class GetSeasonLeaderboardQuery extends Query<{
    seasonId: string;
    language: string;
    rows: unknown[];
}> {
    constructor(public readonly input: GetSeasonLeaderboardInput) {
        super();
    }
}

export class GetSeasonLeaderboardHandler
    implements QueryHandler<GetSeasonLeaderboardQuery> {
    constructor(private readonly seasons: SeasonsReadsSink) { }
    async execute(q: GetSeasonLeaderboardQuery) {
        const season = await this.seasons.get(q.input.id);
        if (!season) throw new DomainError("season.not_found", 404);
        const rows = await this.seasons.getLeaderboard(
            q.input.id,
            q.input.lang,
            q.input.limit,
        );
        return { seasonId: q.input.id, language: q.input.lang, rows };
    }
}
