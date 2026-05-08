import {
    DomainError,
    type Clock,
    type SnippetRepo,
} from "@codetype/domain";
import { accuracy, grossWpm, netWpm, scaledWpm } from "@codetype/domain/wpm";
import { Command, type CommandHandler } from "../../bus/Command";

export interface PracticeHistorySink {
    appendPractice(row: {
        user_id: string;
        snippet_id: string;
        finished_at: number;
        chars_typed: number;
        errors: number;
        duration_ms: number;
        gross_wpm: number;
        net_wpm: number;
        accuracy: number;
        scaled_wpm: number;
    }): Promise<void>;
}

export interface PracticeRunInput {
    userId?: string;
    snippetId: string;
    chars_typed: number;
    errors: number;
    duration_ms: number;
    save: boolean;
}

export interface PracticeRunResult {
    finished_at: number;
    gross_wpm: number;
    net_wpm: number;
    accuracy: number;
    scaled_wpm: number;
    saved: boolean;
}

export class PracticeRunCommand extends Command<PracticeRunResult> {
    constructor(public readonly input: PracticeRunInput) {
        super();
    }
}

export class PracticeRunHandler implements CommandHandler<PracticeRunCommand> {
    constructor(
        private readonly snippets: SnippetRepo,
        private readonly history: PracticeHistorySink,
        private readonly clock: Clock,
    ) { }

    async execute(c: PracticeRunCommand): Promise<PracticeRunResult> {
        if (c.input.save && !c.input.userId) {
            throw new DomainError("practice.unauthorized", 401);
        }
        const snippet = await this.snippets.getMetaById(c.input.snippetId);
        if (!snippet) throw new DomainError("snippet.not_found", 404);
        if (c.input.chars_typed < snippet.length) {
            throw new DomainError("practice.incomplete", 400);
        }
        const finishedAt = this.clock.epochMs();
        const gross = grossWpm(c.input.chars_typed, c.input.duration_ms);
        const net = netWpm(c.input.chars_typed, c.input.errors, c.input.duration_ms);
        const acc = accuracy(c.input.chars_typed, c.input.errors);
        const scaled = scaledWpm(
            c.input.chars_typed,
            c.input.errors,
            c.input.duration_ms,
        );
        let saved = false;
        if (c.input.save && c.input.userId) {
            await this.history.appendPractice({
                user_id: c.input.userId,
                snippet_id: c.input.snippetId,
                finished_at: finishedAt,
                chars_typed: c.input.chars_typed,
                errors: c.input.errors,
                duration_ms: c.input.duration_ms,
                gross_wpm: gross,
                net_wpm: net,
                accuracy: acc,
                scaled_wpm: scaled,
            });
            saved = true;
        }
        return {
            finished_at: finishedAt,
            gross_wpm: gross,
            net_wpm: net,
            accuracy: acc,
            scaled_wpm: scaled,
            saved,
        };
    }
}
