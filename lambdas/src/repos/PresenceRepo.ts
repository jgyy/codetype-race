import {
    DynamoDBDocumentClient,
    DeleteCommand,
    PutCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    presenceConnLookupGSI1PK,
    presenceConnSK,
    presencePK,
} from "@codetype/shared/ddb-keys";
import { ddb, TABLE } from "../ddb";
import { queryGsiThenHydrate } from "./queryGsiThenHydrate";

export const PRESENCE_TTL_SECONDS = 60;

export interface PresenceRow {
    PK: string;
    SK: string;
    GSI1PK: string;
    GSI1SK: string;
    user_id: string;
    connection_id: string;
    last_seen_at: number;
    ttl: number;
}

export class PresenceRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) { }

    async put(userId: string, connectionId: string): Promise<void> {
        const now = Date.now();
        await this.client.send(
            new PutCommand({
                TableName: TABLE,
                Item: {
                    PK: presencePK(userId),
                    SK: presenceConnSK(connectionId),
                    GSI1PK: presenceConnLookupGSI1PK(connectionId),
                    GSI1SK: presencePK(userId),
                    user_id: userId,
                    connection_id: connectionId,
                    last_seen_at: now,
                    ttl: Math.floor(now / 1000) + PRESENCE_TTL_SECONDS,
                },
            }),
        );
    }

    async touch(userId: string, connectionId: string): Promise<void> {
        await this.put(userId, connectionId);
    }

    async userIdByConnection(connectionId: string): Promise<string | null> {
        const items = await queryGsiThenHydrate<PresenceRow>(this.client, TABLE, {
            TableName: TABLE,
            IndexName: "GSI1",
            KeyConditionExpression: "GSI1PK = :pk",
            ExpressionAttributeValues: {
                ":pk": presenceConnLookupGSI1PK(connectionId),
            },
            Limit: 1,
        });
        return items[0]?.user_id ?? null;
    }

    async deleteByConnection(connectionId: string): Promise<string | null> {
        const items = await queryGsiThenHydrate<PresenceRow>(this.client, TABLE, {
            TableName: TABLE,
            IndexName: "GSI1",
            KeyConditionExpression: "GSI1PK = :pk",
            ExpressionAttributeValues: {
                ":pk": presenceConnLookupGSI1PK(connectionId),
            },
            Limit: 1,
        });
        const row = items[0];
        if (!row) return null;
        await this.client.send(
            new DeleteCommand({
                TableName: TABLE,
                Key: { PK: row.PK, SK: row.SK },
            }),
        );
        return row.user_id;
    }

    async isOnline(userId: string): Promise<boolean> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk",
                ExpressionAttributeValues: { ":pk": presencePK(userId) },
                Limit: 1,
            }),
        );
        return (r.Items?.length ?? 0) > 0;
    }

    async whichOnline(userIds: string[]): Promise<Set<string>> {
        const online = new Set<string>();
        await Promise.all(
            userIds.map(async (id) => {
                if (await this.isOnline(id)) online.add(id);
            }),
        );
        return online;
    }

    async listConnections(userId: string): Promise<string[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk",
                ExpressionAttributeValues: { ":pk": presencePK(userId) },
            }),
        );
        return (r.Items ?? []).map((i) => i.connection_id as string);
    }
}

export const presence = new PresenceRepo();
