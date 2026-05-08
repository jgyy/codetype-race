import { DomainError } from "@codetype/domain";
import { Command, type CommandHandler } from "../../bus/Command";

export type ReviewDecision = "approved" | "rejected";

export interface SnippetReviewSink {
    approveOrReject(
        snippetId: string,
        reviewerId: string,
        decision: ReviewDecision,
        reason?: string,
    ): Promise<void>;
}

export interface ReviewSnippetInput {
    snippetId: string;
    reviewerId: string;
    decision: ReviewDecision;
    reason?: string;
}

export interface ReviewSnippetResult {
    snippet_id: string;
    status: ReviewDecision;
}

export class ReviewSnippetCommand extends Command<ReviewSnippetResult> {
    constructor(public readonly input: ReviewSnippetInput) {
        super();
    }
}

export class ReviewSnippetHandler
    implements CommandHandler<ReviewSnippetCommand> {
    constructor(private readonly sink: SnippetReviewSink) { }

    async execute(c: ReviewSnippetCommand): Promise<ReviewSnippetResult> {
        if (c.input.decision !== "approved" && c.input.decision !== "rejected") {
            throw new DomainError("review.bad_decision", 400);
        }
        await this.sink.approveOrReject(
            c.input.snippetId,
            c.input.reviewerId,
            c.input.decision,
            c.input.reason,
        );
        return { snippet_id: c.input.snippetId, status: c.input.decision };
    }
}
