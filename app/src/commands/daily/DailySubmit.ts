import {
    DomainError,
    type SnippetRepo,
} from "@codetype/domain";
import { scaledWpm } from "@codetype/domain/wpm";
import { evaluateStats, isFlagged } from "@codetype/domain/anticheat";
import { Command, type CommandHandler } from "../../bus/Command";

const MAX_WPM = 300;

export interface UserDirectory {
    getOrCreate(
        userId: string,
        displayName: string,
    ): Promise<{ display_name: string }>;
}

export interface DailyRunRow {
    user_id: string;
}

export interface DailyRepoSink {
    submitBest(
        date: string,
        userId: string,
        displayName: string,
        wpm: number,
    ): Promise<{ improved: boolean; bestWpm: number }>;
    listRuns(date: string, limit: number): Promise<DailyRunRow[]>;
}

export interface DailySubmitInput {
    userId: string;
    snippetId: string;
    date: string;
    chars_typed: number;
    errors: number;
    duration_ms: number;
}

export interface DailySubmitResult {
    improved: boolean;
    best_wpm: number;
    rank: number;
}

export class DailySubmitCommand extends Command<DailySubmitResult> {
    constructor(public readonly input: DailySubmitInput) {
        super();
    }
}

export class DailySubmitHandler implements CommandHandler<DailySubmitCommand> {
    constructor(
        private readonly snippets: SnippetRepo,
        private readonly users: UserDirectory,
        private readonly daily: DailyRepoSink,
    ) { }

    async execute(c: DailySubmitCommand): Promise<DailySubmitResult> {
        const snippet = await this.snippets.getMetaById(c.input.snippetId);
        if (!snippet) throw new DomainError("snippet.not_found", 404);
        if (c.input.chars_typed < snippet.length) {
            throw new DomainError("daily.incomplete", 400);
        }
        const wpm = scaledWpm(
            c.input.chars_typed,
            c.input.errors,
            c.input.duration_ms,
        );
        if (wpm < 0 || wpm > MAX_WPM) {
            throw new DomainError("daily.wpm_out_of_range", 400);
        }
        const flags = evaluateStats({
            snippetLength: snippet.length,
            durationMs: c.input.duration_ms,
            charsTyped: c.input.chars_typed,
        });
        if (isFlagged(flags)) {
            throw new DomainError("daily.forbidden", 403);
        }
        const profile = await this.users.getOrCreate(
            c.input.userId,
            c.input.userId.slice(0, 8),
        );
        const result = await this.daily.submitBest(
            c.input.date,
            c.input.userId,
            profile.display_name,
            wpm,
        );
        const runs = await this.daily.listRuns(c.input.date, 1000);
        const rank =
            runs.findIndex((r) => r.user_id === c.input.userId) + 1 ||
            runs.length + 1;
        return {
            improved: result.improved,
            best_wpm: result.bestWpm,
            rank,
        };
    }
}
