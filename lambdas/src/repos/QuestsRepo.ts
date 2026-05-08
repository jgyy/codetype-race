import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
    TransactWriteCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    questActivePK,
    questActiveSK,
    questProgressSK,
    userPK,
    xpLedgerPK,
    xpLedgerSK,
    xpSummarySK,
} from "@codetype/shared/ddb-keys";
import type {
    QuestDef,
    QuestPeriod,
    QuestProgressRow,
} from "@codetype/shared/progression/quests";
import { ddb, TABLE } from "../ddb";

const QUEST_TTL_SECONDS = 7 * 24 * 60 * 60;

export class QuestsRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) { }

    /**
     * Idempotent rotation seed. The cron writes one row per quest with
     * attribute_not_exists(SK) so re-running the cron (or running it
     * twice across regions during a failover) cannot duplicate rows.
     */
    async seedRotation(
        period: QuestPeriod,
        rotationId: string,
        defs: QuestDef[],
    ): Promise<{ written: number }> {
        let written = 0;
        for (const q of defs) {
            try {
                await this.client.send(
                    new PutCommand({
                        TableName: TABLE,
                        Item: {
                            PK: questActivePK(period, rotationId),
                            SK: questActiveSK(q.id),
                            quest_id: q.id,
                            period,
                            rotation_id: rotationId,
                            target: q.target,
                            xp: q.xp,
                            ttl:
                                Math.floor(Date.now() / 1000) +
                                QUEST_TTL_SECONDS,
                        },
                        ConditionExpression: "attribute_not_exists(SK)",
                    }),
                );
                written++;
            } catch (e: any) {
                if (e?.name !== "ConditionalCheckFailedException") throw e;
            }
        }
        return { written };
    }

    async listActive(
        period: QuestPeriod,
        rotationId: string,
    ): Promise<{ quest_id: string; target: number; xp: number }[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": questActivePK(period, rotationId),
                    ":sk": "Q#",
                },
            }),
        );
        return ((r.Items ?? []) as Array<{
            quest_id: string;
            target: number;
            xp: number;
        }>).map((i) => ({
            quest_id: i.quest_id,
            target: i.target,
            xp: i.xp,
        }));
    }

    /**
     * Atomic progress increment, capped at target. Returns the post-update
     * progress, or null if no row was modified (already at target).
     */
    async addProgress(
        userId: string,
        rotationId: string,
        q: QuestDef,
        delta: number,
    ): Promise<{ progress: number; completed: boolean } | null> {
        try {
            const r = await this.client.send(
                new UpdateCommand({
                    TableName: TABLE,
                    Key: {
                        PK: userPK(userId),
                        SK: questProgressSK(rotationId, q.id),
                    },
                    UpdateExpression:
                        "SET quest_id = if_not_exists(quest_id, :qid), rotation_id = if_not_exists(rotation_id, :rid), #t = if_not_exists(#t, :tgt), claimed = if_not_exists(claimed, :false_), updatedAt = :now ADD progress :d",
                    ConditionExpression:
                        "attribute_not_exists(progress) OR progress < :tgt",
                    ExpressionAttributeNames: { "#t": "target" },
                    ExpressionAttributeValues: {
                        ":qid": q.id,
                        ":rid": rotationId,
                        ":tgt": q.target,
                        ":d": delta,
                        ":false_": false,
                        ":now": new Date().toISOString(),
                    },
                    ReturnValues: "ALL_NEW",
                }),
            );
            const progress = Number(
                (r.Attributes as any)?.progress ?? 0,
            );
            const target = Number(
                (r.Attributes as any)?.target ?? q.target,
            );
            return {
                progress: Math.min(progress, target),
                completed: progress >= target,
            };
        } catch (e: any) {
            if (e?.name === "ConditionalCheckFailedException") return null;
            throw e;
        }
    }

    async getProgressMap(
        userId: string,
        rotationId: string,
    ): Promise<Map<string, QuestProgressRow>> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": userPK(userId),
                    ":sk": `QPROG#${rotationId}#`,
                },
            }),
        );
        const out = new Map<string, QuestProgressRow>();
        for (const item of (r.Items ?? []) as any[]) {
            out.set(item.quest_id, {
                rotation_id: item.rotation_id,
                quest_id: item.quest_id,
                progress: Number(item.progress ?? 0),
                target: Number(item.target ?? 0),
                claimed: !!item.claimed,
                claimed_at: item.claimed_at,
            });
        }
        return out;
    }

    /**
     * Transactional claim: marks progress row as claimed, bumps XP
     * summary, appends an XP ledger row — all-or-nothing.
     *
     * Returns true if the claim succeeded, false if it was a no-op
     * (already claimed, or progress < target).
     */
    async claim(
        userId: string,
        rotationId: string,
        q: QuestDef,
    ): Promise<boolean> {
        const now = new Date().toISOString();
        const epochMs = Date.now();
        const claimEventId = `claim:${rotationId}:${q.id}`;
        try {
            await this.client.send(
                new TransactWriteCommand({
                    TransactItems: [
                        {
                            Update: {
                                TableName: TABLE,
                                Key: {
                                    PK: userPK(userId),
                                    SK: questProgressSK(rotationId, q.id),
                                },
                                UpdateExpression:
                                    "SET claimed = :true_, claimed_at = :now",
                                ConditionExpression:
                                    "claimed = :false_ AND progress >= #t",
                                ExpressionAttributeNames: { "#t": "target" },
                                ExpressionAttributeValues: {
                                    ":true_": true,
                                    ":false_": false,
                                    ":now": now,
                                },
                            },
                        },
                        {
                            Update: {
                                TableName: TABLE,
                                Key: {
                                    PK: userPK(userId),
                                    SK: xpSummarySK(),
                                },
                                UpdateExpression:
                                    "ADD totalXp :d SET updatedAt = :now",
                                ExpressionAttributeValues: {
                                    ":d": q.xp,
                                    ":now": now,
                                },
                            },
                        },
                        {
                            Put: {
                                TableName: TABLE,
                                Item: {
                                    PK: xpLedgerPK(userId),
                                    SK: xpLedgerSK(epochMs, claimEventId),
                                    event_id: claimEventId,
                                    type: "QUEST_CLAIMED",
                                    occurred_at: now,
                                    delta: q.xp,
                                    source: "stream",
                                },
                                ConditionExpression: "attribute_not_exists(SK)",
                            },
                        },
                    ],
                }),
            );
            return true;
        } catch (e: any) {
            if (
                e?.name === "TransactionCanceledException" ||
                e?.name === "ConditionalCheckFailedException"
            ) {
                return false;
            }
            throw e;
        }
    }

    async getProgress(
        userId: string,
        rotationId: string,
        questId: string,
    ): Promise<QuestProgressRow | null> {
        const r = await this.client.send(
            new GetCommand({
                TableName: TABLE,
                Key: {
                    PK: userPK(userId),
                    SK: questProgressSK(rotationId, questId),
                },
            }),
        );
        if (!r.Item) return null;
        const i = r.Item as any;
        return {
            rotation_id: i.rotation_id,
            quest_id: i.quest_id,
            progress: Number(i.progress ?? 0),
            target: Number(i.target ?? 0),
            claimed: !!i.claimed,
            claimed_at: i.claimed_at,
        };
    }
}

export const quests = new QuestsRepo();
