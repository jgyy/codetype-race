import {
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
    BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    pinnedSK,
    unlockedGSI1PK,
    unlockedGSI1SK,
    unlockedSK,
    userPK,
} from "@codetype/shared/ddb-keys";
import type {
    AchievementDef,
    UnlockedAchievement,
} from "@codetype/shared/progression/achievements";
import { ddb, TABLE } from "../ddb";

interface UnlockedRow {
    achievement_id: string;
    unlocked_at: string;
    xp_awarded: number;
}

export class AchievementsRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) { }

    /**
     * Idempotent unlock. Returns true if the row was newly written,
     * false if it already existed (a duplicate stream batch retry).
     */
    async tryUnlock(
        userId: string,
        def: AchievementDef,
        unlockedAtIso: string,
    ): Promise<boolean> {
        try {
            await this.client.send(
                new PutCommand({
                    TableName: TABLE,
                    Item: {
                        PK: userPK(userId),
                        SK: unlockedSK(def.id),
                        ...(def.unlisted
                            ? {}
                            : {
                                GSI1PK: unlockedGSI1PK(def.id),
                                GSI1SK: unlockedGSI1SK(unlockedAtIso),
                            }),
                        achievement_id: def.id,
                        unlocked_at: unlockedAtIso,
                        xp_awarded: def.xp,
                    },
                    ConditionExpression: "attribute_not_exists(SK)",
                }),
            );
            return true;
        } catch (e: any) {
            if (e?.name === "ConditionalCheckFailedException") return false;
            throw e;
        }
    }

    async listForUser(userId: string): Promise<UnlockedAchievement[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression:
                    "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": userPK(userId),
                    ":sk": "ACH#",
                },
            }),
        );
        return ((r.Items ?? []) as UnlockedRow[]).map((row) => ({
            achievement_id: row.achievement_id,
            unlocked_at: row.unlocked_at,
            xp_awarded: row.xp_awarded ?? 0,
        }));
    }

    async listPinned(userId: string): Promise<string[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression:
                    "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": userPK(userId),
                    ":sk": "ACHPIN#",
                },
            }),
        );
        const items = (r.Items ?? []) as Array<{
            SK: string;
            achievement_id: string;
        }>;
        return items
            .sort((a, b) => a.SK.localeCompare(b.SK))
            .map((i) => i.achievement_id);
    }

    async setPinned(userId: string, slots: string[]): Promise<void> {
        const existing = await this.listPinned(userId);
        const writes: any[] = [];
        for (let i = 0; i < existing.length; i++) {
            writes.push({
                DeleteRequest: {
                    Key: { PK: userPK(userId), SK: pinnedSK(i) },
                },
            });
        }
        for (let i = 0; i < slots.length && i < 6; i++) {
            writes.push({
                PutRequest: {
                    Item: {
                        PK: userPK(userId),
                        SK: pinnedSK(i),
                        achievement_id: slots[i],
                        slot: i,
                    },
                },
            });
        }
        if (writes.length === 0) return;
        for (let i = 0; i < writes.length; i += 25) {
            await this.client.send(
                new BatchWriteCommand({
                    RequestItems: { [TABLE]: writes.slice(i, i + 25) },
                }),
            );
        }
    }
}

export const achievements = new AchievementsRepo();
