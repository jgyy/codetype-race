import {
    DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
    ScanCommand,
    TransactWriteCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
    langGSI1PK,
    pendingQueuePK,
    pendingQueueSK,
    snippetDiffGSI1SK,
    snippetDiffPrefix,
    snippetPK,
} from "@codetype/shared/ddb-keys";
import type {
    Snippet,
    SnippetFilters,
    SnippetSubmission,
} from "@codetype/shared/schemas";
import { ddb, TABLE } from "../ddb";
import { Errors } from "../AppError";

const RANDOM_PAGE_SIZE = 25;

export class SnippetRepo {
    constructor(
        private readonly client: DynamoDBDocumentClient = ddb,
        private readonly rng: () => number = Math.random,
    ) { }

    async getById(snippetId: string): Promise<Snippet | null> {
        const r = await this.client.send(
            new GetCommand({
                TableName: TABLE,
                Key: { PK: snippetPK(snippetId), SK: "META" },
            }),
        );
        return (r.Item as Snippet | undefined) ?? null;
    }

    async list(filters: SnippetFilters = {}, limit = 100): Promise<Snippet[]> {
        if (!filters.language) {
            const r = await this.client.send(
                new ScanCommand({
                    TableName: TABLE,
                    FilterExpression:
                        "begins_with(PK, :p) AND SK = :sk AND (attribute_not_exists(#status) OR #status = :approved)",
                    ExpressionAttributeNames: { "#status": "status" },
                    ExpressionAttributeValues: {
                        ":p": "SNIPPET#",
                        ":sk": "META",
                        ":approved": "approved",
                    },
                    Limit: limit,
                }),
            );
            return (r.Items as Snippet[] | undefined) ?? [];
        }
        const exprValues: Record<string, unknown> = {
            ":pk": langGSI1PK(filters.language),
            ":approved": "approved",
        };
        let keyExpr = "GSI1PK = :pk";
        if (filters.difficulty !== undefined) {
            keyExpr += " AND begins_with(GSI1SK, :diff)";
            exprValues[":diff"] = snippetDiffPrefix(filters.difficulty);
        }
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                IndexName: "GSI1",
                KeyConditionExpression: keyExpr,
                FilterExpression:
                    "attribute_not_exists(#status) OR #status = :approved",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: exprValues,
                Limit: limit,
            }),
        );
        return (r.Items as Snippet[] | undefined) ?? [];
    }

    async submitPending(
        snippetId: string,
        submittedBy: string,
        submission: SnippetSubmission,
    ): Promise<void> {
        const submittedAt = Date.now();
        const item = {
            PK: snippetPK(snippetId),
            SK: "META",
            GSI1PK: langGSI1PK(submission.language),
            GSI1SK: snippetDiffGSI1SK(submission.difficulty, snippetId),
            snippet_id: snippetId,
            language: submission.language,
            title: submission.title,
            code: submission.text,
            length: submission.text.length,
            difficulty: submission.difficulty,
            tags: [],
            status: "pending",
            submitted_by: submittedBy,
            submitted_at: submittedAt,
            ...(submission.source ? { source: submission.source } : {}),
        };
        await this.client.send(
            new TransactWriteCommand({
                TransactItems: [
                    {
                        Put: {
                            TableName: TABLE,
                            Item: item,
                            ConditionExpression: "attribute_not_exists(PK)",
                        },
                    },
                    {
                        Put: {
                            TableName: TABLE,
                            Item: {
                                PK: pendingQueuePK(),
                                SK: pendingQueueSK(submittedAt, snippetId),
                                snippet_id: snippetId,
                                submitted_by: submittedBy,
                                submitted_at: submittedAt,
                                title: submission.title,
                                language: submission.language,
                                difficulty: submission.difficulty,
                            },
                        },
                    },
                ],
            }),
        );
    }

    async listPending(limit = 100): Promise<Snippet[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": pendingQueuePK(),
                    ":sk": "SUBMITTED#",
                },
                Limit: limit,
            }),
        );
        const queue = (r.Items as Array<{ snippet_id: string }> | undefined) ?? [];
        if (queue.length === 0) return [];
        const items = await Promise.all(
            queue.map((q) => this.getById(q.snippet_id)),
        );
        return items.filter((s): s is Snippet => s !== null);
    }

    async approveOrReject(
        snippetId: string,
        reviewerId: string,
        decision: "approved" | "rejected",
        reason?: string,
    ): Promise<void> {
        const snippet = await this.getById(snippetId);
        if (!snippet) throw Errors.NotFound("snippet");
        if (snippet.status !== "pending") {
            throw Errors.Conflict("snippet not pending review");
        }
        const submittedAt = (snippet as any).submitted_at as number | undefined;
        const transactItems: any[] = [
            {
                Update: {
                    TableName: TABLE,
                    Key: { PK: snippetPK(snippetId), SK: "META" },
                    UpdateExpression:
                        "SET #status = :s, reviewed_by = :rb, reviewed_at = :ra" +
                        (decision === "rejected" && reason ? ", reject_reason = :rr" : ""),
                    ConditionExpression: "#status = :pending",
                    ExpressionAttributeNames: { "#status": "status" },
                    ExpressionAttributeValues: {
                        ":s": decision,
                        ":rb": reviewerId,
                        ":ra": Date.now(),
                        ":pending": "pending",
                        ...(decision === "rejected" && reason ? { ":rr": reason } : {}),
                    },
                },
            },
        ];
        if (submittedAt) {
            transactItems.push({
                Delete: {
                    TableName: TABLE,
                    Key: {
                        PK: pendingQueuePK(),
                        SK: pendingQueueSK(submittedAt, snippetId),
                    },
                },
            });
        }
        try {
            await this.client.send(
                new TransactWriteCommand({ TransactItems: transactItems }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw Errors.Conflict("snippet not pending review");
            }
            throw e;
        }
    }

    async incrementDailySubmitCounter(
        userId: string,
        date: string,
        limit = 5,
    ): Promise<number> {
        try {
            const r = await this.client.send(
                new UpdateCommand({
                    TableName: TABLE,
                    Key: { PK: `USER#${userId}`, SK: `SUBMIT_DAY#${date}` },
                    UpdateExpression:
                        "ADD #c :one SET ttl = if_not_exists(ttl, :ttl)",
                    ConditionExpression:
                        "attribute_not_exists(#c) OR #c < :limit",
                    ExpressionAttributeNames: { "#c": "count" },
                    ExpressionAttributeValues: {
                        ":one": 1,
                        ":limit": limit,
                        ":ttl": Math.floor(Date.now() / 1000) + 172_800,
                    },
                    ReturnValues: "UPDATED_NEW",
                }),
            );
            return (r.Attributes as { count?: number } | undefined)?.count ?? 1;
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw Errors.RateLimited();
            }
            throw e;
        }
    }
    async random(filters: SnippetFilters = {}): Promise<Snippet | null> {
        const candidates = await this.list(filters, RANDOM_PAGE_SIZE);
        if (candidates.length === 0) return null;
        const idx = Math.floor(this.rng() * candidates.length);
        return candidates[idx] ?? null;
    }
}

export const snippets = new SnippetRepo();
