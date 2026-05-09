import {
    type DynamoDBDocumentClient,
    DeleteCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    outboxDlqPK,
    outboxPK,
    outboxSK,
} from "@codetype/shared/ddb-keys";
import {
    type OutboxClaim,
    type OutboxStore,
} from "@codetype/domain/ports/OutboxStore";
import type { OutboxEntry } from "@codetype/domain/events/OutboxEntry";

export interface DdbOutboxStoreConfig {
    table: string;
    client: DynamoDBDocumentClient;
}

interface OutboxItem extends OutboxEntry {
    PK: string;
    SK: string;
}

function entryFromItem(item: Record<string, unknown>): OutboxEntry {
    return {
        id: String(item.id),
        raceId: String(item.raceId),
        eventSeq: Number(item.eventSeq),
        eventType: String(item.eventType),
        channel: item.channel as OutboxEntry["channel"],
        payload: (item.payload as Record<string, unknown>) ?? {},
        attempts: Number(item.attempts),
        enqueuedAt: String(item.enqueuedAt),
        nextAttemptAt: String(item.nextAttemptAt),
    };
}

export class DdbOutboxStore implements OutboxStore {
    constructor(private readonly cfg: DdbOutboxStoreConfig) { }

    async claim(now: string, limit: number): Promise<OutboxClaim[]> {
        const r = await this.cfg.client.send(
            new QueryCommand({
                TableName: this.cfg.table,
                KeyConditionExpression: "PK = :pk",
                FilterExpression: "nextAttemptAt <= :now",
                ExpressionAttributeValues: { ":pk": outboxPK(), ":now": now },
                Limit: limit,
            }),
        );
        const items = (r.Items as Record<string, unknown>[] | undefined) ?? [];
        return items.slice(0, limit).map((item) => {
            const entry = entryFromItem(item);
            return { entry, receipt: entry.id } as OutboxClaim;
        });
    }

    async ack(claim: OutboxClaim): Promise<void> {
        const id = claim.receipt as string;
        await this.cfg.client.send(
            new DeleteCommand({
                TableName: this.cfg.table,
                Key: { PK: outboxPK(), SK: outboxSK(id) },
            }),
        );
    }

    async fail(claim: OutboxClaim, nextAttemptAt: string): Promise<void> {
        const id = claim.receipt as string;
        await this.cfg.client.send(
            new UpdateCommand({
                TableName: this.cfg.table,
                Key: { PK: outboxPK(), SK: outboxSK(id) },
                UpdateExpression:
                    "SET attempts = if_not_exists(attempts, :zero) + :one, nextAttemptAt = :next",
                ExpressionAttributeValues: {
                    ":one": 1,
                    ":zero": 0,
                    ":next": nextAttemptAt,
                },
                ConditionExpression: "attribute_exists(PK)",
            }),
        );
    }

    async deadLetter(claim: OutboxClaim, reason: string): Promise<void> {
        const id = claim.receipt as string;
        const dlqItem: OutboxItem & { reason: string; deadLetteredAt: string } = {
            ...claim.entry,
            PK: outboxDlqPK(),
            SK: outboxSK(id),
            reason,
            deadLetteredAt: new Date().toISOString(),
        };
        await this.cfg.client.send(
            new PutCommand({ TableName: this.cfg.table, Item: dlqItem }),
        );
        await this.cfg.client.send(
            new DeleteCommand({
                TableName: this.cfg.table,
                Key: { PK: outboxPK(), SK: outboxSK(id) },
            }),
        );
    }
}
