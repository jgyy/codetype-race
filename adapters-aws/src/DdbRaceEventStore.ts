import {
    type DynamoDBDocumentClient,
    QueryCommand,
    TransactWriteCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
    formatRaceSeq,
    idempotencyPK,
    idempotencySK,
    outboxPK,
    outboxSK,
    raceCounterSK,
    raceEventSK,
    raceEventTypeGSI1PK,
    racePK,
} from "@codetype/shared/ddb-keys";
import {
    TransactionConflictError,
    type AppendCommandArgs,
    type RaceEventStore,
} from "@codetype/domain/ports/RaceEventStore";
import type { RaceEvent } from "@codetype/domain/events/RaceEvent";

export interface DdbRaceEventStoreConfig {
    table: string;
    client: DynamoDBDocumentClient;
}

function eventFromItem(item: Record<string, unknown>): RaceEvent {
    return {
        raceId: String(item.raceId),
        seq: Number(item.seq),
        type: item.type as RaceEvent["type"],
        occurredAt: String(item.occurredAt),
        actorId: item.actorId == null ? null : String(item.actorId),
        payload: (item.payload as Record<string, unknown>) ?? {},
        commandId: item.commandId == null ? null : String(item.commandId),
        causationId: item.causationId == null ? null : String(item.causationId),
        correlationId: String(item.correlationId),
    };
}

export class DdbRaceEventStore implements RaceEventStore {
    constructor(private readonly cfg: DdbRaceEventStoreConfig) { }

    async allocateSeqs(raceId: string, count: number): Promise<number[]> {
        if (!Number.isInteger(count) || count <= 0) {
            throw new Error(`invalid count: ${count}`);
        }
        const r = await this.cfg.client.send(
            new UpdateCommand({
                TableName: this.cfg.table,
                Key: { PK: racePK(raceId), SK: raceCounterSK() },
                UpdateExpression:
                    "SET nextSeq = if_not_exists(nextSeq, :zero) + :n",
                ExpressionAttributeValues: { ":zero": 0, ":n": count },
                ReturnValues: "UPDATED_NEW",
            }),
        );
        const newValue = Number(r.Attributes?.nextSeq);
        if (!Number.isFinite(newValue) || newValue < count) {
            throw new Error(`counter returned unexpected value: ${newValue}`);
        }
        const start = newValue - count;
        return Array.from({ length: count }, (_, i) => start + i);
    }

    async appendCommand(args: AppendCommandArgs): Promise<void> {
        const items: NonNullable<
            ConstructorParameters<typeof TransactWriteCommand>[0]["TransactItems"]
        > = [];

        for (const ev of args.events) {
            items.push({
                Put: {
                    TableName: this.cfg.table,
                    Item: {
                        PK: racePK(ev.raceId),
                        SK: raceEventSK(ev.seq),
                        GSI1PK: raceEventTypeGSI1PK(ev.type),
                        GSI1SK: ev.occurredAt,
                        ...ev,
                        seqStr: formatRaceSeq(ev.seq),
                    },
                    ConditionExpression: "attribute_not_exists(SK)",
                },
            });
        }

        for (const ob of args.outboxEntries ?? []) {
            items.push({
                Put: {
                    TableName: this.cfg.table,
                    Item: {
                        PK: outboxPK(),
                        SK: outboxSK(ob.id),
                        ...ob,
                    },
                    ConditionExpression: "attribute_not_exists(SK)",
                },
            });
        }

        if (args.idempotency) {
            const idem = args.idempotency;
            const expiresAt =
                Math.floor(Date.parse(idem.storedAt) / 1000) + idem.ttl;
            items.push({
                Put: {
                    TableName: this.cfg.table,
                    Item: {
                        PK: idempotencyPK(idem.userId),
                        SK: idempotencySK(idem.commandId),
                        ...idem,
                        expiresAt,
                    },
                    ConditionExpression: "attribute_not_exists(PK)",
                },
            });
        }

        if (items.length === 0) return;

        try {
            await this.cfg.client.send(
                new TransactWriteCommand({ TransactItems: items }),
            );
        } catch (e) {
            if (e instanceof TransactionCanceledException) {
                const reasons = (e.CancellationReasons ?? [])
                    .map((r) => r.Code ?? "unknown")
                    .join(",");
                throw new TransactionConflictError(
                    `appendCommand transaction cancelled: ${reasons}`,
                );
            }
            throw e;
        }
    }

    async listEvents(args: {
        raceId: string;
        sinceSeq: number;
        limit: number;
    }): Promise<RaceEvent[]> {
        const noLowerBound = args.sinceSeq < 0;
        const r = await this.cfg.client.send(
            new QueryCommand({
                TableName: this.cfg.table,
                KeyConditionExpression: noLowerBound
                    ? "PK = :pk AND begins_with(SK, :prefix)"
                    : "PK = :pk AND SK > :sk",
                ExpressionAttributeValues: noLowerBound
                    ? { ":pk": racePK(args.raceId), ":prefix": "EV#" }
                    : { ":pk": racePK(args.raceId), ":sk": raceEventSK(args.sinceSeq) },
                Limit: args.limit,
                ScanIndexForward: true,
            }),
        );
        const items = (r.Items as Record<string, unknown>[] | undefined) ?? [];
        return items
            .filter((i) => typeof i.SK === "string" && (i.SK as string).startsWith("EV#"))
            .map(eventFromItem);
    }
}
