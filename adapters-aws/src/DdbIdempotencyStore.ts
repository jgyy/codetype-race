import {
    type DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
    idempotencyPK,
    idempotencySK,
} from "@codetype/shared/ddb-keys";
import {
    IdempotencyConflictError,
    type IdempotencyRecord,
    type IdempotencyStore,
} from "@codetype/domain/ports/IdempotencyStore";

export interface DdbIdempotencyStoreConfig {
    table: string;
    client: DynamoDBDocumentClient;
}

interface IdempotencyItem extends IdempotencyRecord {
    PK: string;
    SK: string;
    expiresAt: number;
}

function rowFromItem(item: Record<string, unknown>): IdempotencyRecord {
    return {
        userId: String(item.userId),
        commandId: String(item.commandId),
        httpStatus: Number(item.httpStatus),
        body: item.body,
        storedAt: String(item.storedAt),
        ttl: Number(item.ttl),
    };
}

export class DdbIdempotencyStore implements IdempotencyStore {
    constructor(private readonly cfg: DdbIdempotencyStoreConfig) { }

    async get(userId: string, commandId: string): Promise<IdempotencyRecord | null> {
        const r = await this.cfg.client.send(
            new GetCommand({
                TableName: this.cfg.table,
                Key: { PK: idempotencyPK(userId), SK: idempotencySK(commandId) },
            }),
        );
        return r.Item ? rowFromItem(r.Item) : null;
    }

    async put(record: IdempotencyRecord): Promise<void> {
        const expiresAt = Math.floor(Date.parse(record.storedAt) / 1000) + record.ttl;
        const item: IdempotencyItem = {
            ...record,
            PK: idempotencyPK(record.userId),
            SK: idempotencySK(record.commandId),
            expiresAt,
        };
        try {
            await this.cfg.client.send(
                new PutCommand({
                    TableName: this.cfg.table,
                    Item: item,
                    ConditionExpression: "attribute_not_exists(PK)",
                    ReturnValuesOnConditionCheckFailure: "ALL_OLD",
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                const existing = e.Item
                    ? rowFromItem(e.Item as Record<string, unknown>)
                    : await this.get(record.userId, record.commandId);
                if (existing) throw new IdempotencyConflictError(existing);
            }
            throw e;
        }
    }
}
