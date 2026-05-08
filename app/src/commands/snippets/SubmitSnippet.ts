import { Command, type CommandHandler } from "../../bus/Command";
import type { Random } from "@codetype/domain";

export interface SnippetSubmissionPayload {
    language: string;
    title: string;
    text: string;
    difficulty: number;
    source?: string;
}

export interface SnippetSubmissionSink {
    /** Throws DomainError("rate_limited") when the daily cap is hit. */
    incrementDailySubmitCounter(
        userId: string,
        dateUtc: string,
        limit: number,
    ): Promise<number>;
    submitPending(
        snippetId: string,
        submittedBy: string,
        submission: SnippetSubmissionPayload,
    ): Promise<void>;
}

export interface SubmitSnippetInput {
    userId: string;
    dateUtc: string;
    submission: SnippetSubmissionPayload;
}

export interface SubmitSnippetResult {
    snippet_id: string;
    status: "pending";
}

export class SubmitSnippetCommand extends Command<SubmitSnippetResult> {
    constructor(public readonly input: SubmitSnippetInput) {
        super();
    }
}

const DAILY_LIMIT = 5;

export class SubmitSnippetHandler implements CommandHandler<SubmitSnippetCommand> {
    constructor(
        private readonly sink: SnippetSubmissionSink,
        private readonly random: Random,
    ) { }

    async execute(c: SubmitSnippetCommand): Promise<SubmitSnippetResult> {
        await this.sink.incrementDailySubmitCounter(
            c.input.userId,
            c.input.dateUtc,
            DAILY_LIMIT,
        );
        const snippetId = this.random.uuid();
        await this.sink.submitPending(snippetId, c.input.userId, c.input.submission);
        return { snippet_id: snippetId, status: "pending" };
    }
}
