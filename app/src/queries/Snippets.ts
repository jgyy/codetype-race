import { DomainError } from "@codetype/domain";
import { Query, type QueryHandler } from "../bus/Command";

/* ------------------- shared sink shapes -------------------------------- */

export interface SnippetFull {
    snippet_id: string;
    [k: string]: unknown;
}

export interface SnippetReadsSink {
    getById(id: string): Promise<SnippetFull | null>;
    list(
        filters: { language?: string; difficulty?: number },
        limit: number,
    ): Promise<SnippetFull[]>;
    listPending(limit: number): Promise<SnippetFull[]>;
    random(filters: { language?: string; difficulty?: number }): Promise<SnippetFull | null>;
}

export interface DailyMeta {
    snippet_id: string;
}

export interface DailyRunRow {
    user_id: string;
    display_name: string;
    scaled_wpm: number;
    finished_at: number;
}

export interface DailyReadsSink {
    getMeta(date: string): Promise<DailyMeta | null>;
    listRuns(date: string, limit: number): Promise<DailyRunRow[]>;
}

/* ------------------- GetRandomSnippet ---------------------------------- */

export class GetRandomSnippetQuery extends Query<SnippetFull> {
    constructor(public readonly filters: { language?: string; difficulty?: number }) {
        super();
    }
}

export class GetRandomSnippetHandler
    implements QueryHandler<GetRandomSnippetQuery> {
    constructor(private readonly snippets: SnippetReadsSink) { }
    async execute(q: GetRandomSnippetQuery): Promise<SnippetFull> {
        const picked = await this.snippets.random(q.filters);
        if (!picked) throw new DomainError("snippet.not_found", 404);
        return picked;
    }
}

/* ------------------- ListPendingSnippets ------------------------------- */

export class ListPendingSnippetsQuery extends Query<{ items: SnippetFull[] }> {
    constructor(public readonly limit: number = 100) {
        super();
    }
}

export class ListPendingSnippetsHandler
    implements QueryHandler<ListPendingSnippetsQuery> {
    constructor(private readonly snippets: SnippetReadsSink) { }
    async execute(q: ListPendingSnippetsQuery) {
        return { items: await this.snippets.listPending(q.limit) };
    }
}

/* ------------------- GetStarterPack ------------------------------------ */

export interface GetStarterPackInput {
    languages: string[];
    n: number;
}

export class GetStarterPackQuery extends Query<{ snippets: SnippetFull[] }> {
    constructor(public readonly input: GetStarterPackInput) {
        super();
    }
}

export class GetStarterPackHandler
    implements QueryHandler<GetStarterPackQuery> {
    constructor(private readonly snippets: SnippetReadsSink) { }
    async execute(q: GetStarterPackQuery) {
        const { languages, n } = q.input;
        let pool: SnippetFull[] = [];
        if (languages.length === 0) {
            pool = await this.snippets.list({}, n * 2);
        } else {
            const perLang = Math.max(1, Math.ceil(n / languages.length));
            const results = await Promise.all(
                languages.map((language) =>
                    this.snippets.list({ language }, perLang * 2),
                ),
            );
            pool = results.flat();
        }
        const seen = new Set<string>();
        const out: SnippetFull[] = [];
        for (const s of pool) {
            if (seen.has(s.snippet_id)) continue;
            seen.add(s.snippet_id);
            out.push(s);
            if (out.length >= n) break;
        }
        return { snippets: out };
    }
}

/* ------------------- GetDaily ----------------------------------------- */

export interface GetDailyResult {
    date: string;
    snippet: SnippetFull;
}

export class GetDailyQuery extends Query<GetDailyResult> {
    constructor(public readonly date: string) {
        super();
    }
}

export class GetDailyHandler implements QueryHandler<GetDailyQuery> {
    constructor(
        private readonly daily: DailyReadsSink,
        private readonly snippets: SnippetReadsSink,
    ) { }
    async execute(q: GetDailyQuery): Promise<GetDailyResult> {
        const meta = await this.daily.getMeta(q.date);
        if (!meta) throw new DomainError("daily.not_found", 404);
        const snippet = await this.snippets.getById(meta.snippet_id);
        if (!snippet) throw new DomainError("snippet.not_found", 404);
        return { date: q.date, snippet };
    }
}

/* ------------------- GetDailyLeaderboard ------------------------------ */

export interface GetDailyLeaderboardResult {
    date: string;
    entries: Array<{
        user_id: string;
        display_name: string;
        scaled_wpm: number;
        finished_at: number;
    }>;
}

export class GetDailyLeaderboardQuery extends Query<GetDailyLeaderboardResult> {
    constructor(
        public readonly date: string,
        public readonly limit: number = 100,
    ) {
        super();
    }
}

export class GetDailyLeaderboardHandler
    implements QueryHandler<GetDailyLeaderboardQuery> {
    constructor(private readonly daily: DailyReadsSink) { }
    async execute(q: GetDailyLeaderboardQuery): Promise<GetDailyLeaderboardResult> {
        const runs = await this.daily.listRuns(q.date, q.limit);
        return {
            date: q.date,
            entries: runs.map((r) => ({
                user_id: r.user_id,
                display_name: r.display_name,
                scaled_wpm: r.scaled_wpm,
                finished_at: r.finished_at,
            })),
        };
    }
}
