import {
    type DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
    ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    langGSI1PK,
    snippetDiffPrefix,
    snippetPK,
} from "@codetype/shared/ddb-keys";
import type {
    SnippetFilters,
    SnippetMeta,
    SnippetRef,
    SnippetRepo,
} from "@codetype/domain";

const RANDOM_PAGE_SIZE = 25;

export interface DdbSnippetRepoConfig {
    table: string;
    client: DynamoDBDocumentClient;
    rng?: () => number;
}

/**
 * Phase-13 slice-13.3: only the methods CreateRoom uses (`getById`,
 * `random`). Pending-queue, list, approval, etc. stay on the legacy
 * SnippetRepo for now.
 */
export class DdbSnippetRepo implements SnippetRepo {
    private readonly rng: () => number;
    constructor(private readonly cfg: DdbSnippetRepoConfig) {
        this.rng = cfg.rng ?? Math.random;
    }

    async getById(snippetId: string): Promise<SnippetRef | null> {
        const r = await this.cfg.client.send(
            new GetCommand({
                TableName: this.cfg.table,
                Key: { PK: snippetPK(snippetId), SK: "META" },
            }),
        );
        const item = r.Item as { snippet_id?: string } | undefined;
        return item?.snippet_id ? { snippet_id: item.snippet_id } : null;
    }

    async getMetaById(snippetId: string): Promise<SnippetMeta | null> {
        const r = await this.cfg.client.send(
            new GetCommand({
                TableName: this.cfg.table,
                Key: { PK: snippetPK(snippetId), SK: "META" },
            }),
        );
        const item = r.Item as
            | { snippet_id?: string; language?: string; length?: number }
            | undefined;
        if (!item?.snippet_id || !item.language || item.length === undefined) {
            return null;
        }
        return {
            snippet_id: item.snippet_id,
            language: item.language,
            length: item.length,
        };
    }

    async random(filters: SnippetFilters): Promise<SnippetRef | null> {
        const candidates = await this.list(filters, RANDOM_PAGE_SIZE);
        if (candidates.length === 0) return null;
        const idx = Math.floor(this.rng() * candidates.length);
        return candidates[idx] ?? null;
    }

    private async list(
        filters: SnippetFilters,
        limit: number,
    ): Promise<SnippetRef[]> {
        if (!filters.language) {
            const r = await this.cfg.client.send(
                new ScanCommand({
                    TableName: this.cfg.table,
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
            return (r.Items as Array<{ snippet_id: string }> | undefined) ?? [];
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
        const r = await this.cfg.client.send(
            new QueryCommand({
                TableName: this.cfg.table,
                IndexName: "GSI1",
                KeyConditionExpression: keyExpr,
                FilterExpression:
                    "attribute_not_exists(#status) OR #status = :approved",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: exprValues,
                Limit: limit,
            }),
        );
        return (r.Items as Array<{ snippet_id: string }> | undefined) ?? [];
    }
}
