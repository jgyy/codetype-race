import {
    DynamoDBDocumentClient,
    DeleteCommand,
    PutCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    connGSI1PK,
    tournConnSK,
    tournPK,
} from "@codetype/shared/ddb-keys";
import { ddb, TABLE } from "../ddb";

const TTL_SECONDS = 60;

export interface TournConnRow {
    PK: string;
    SK: string;
    GSI1PK: string;
    GSI1SK: string;
    connection_id: string;
    tourn_id: string;
    user_id?: string;
    joined_at: number;
    ttl: number;
}

export class TournConnectionRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) { }

    async put(
        tournId: string,
        connectionId: string,
        userId?: string,
    ): Promise<void> {
        const now = Date.now();
        await this.client.send(
            new PutCommand({
                TableName: TABLE,
                Item: {
                    PK: tournPK(tournId),
                    SK: tournConnSK(connectionId),
                    GSI1PK: connGSI1PK(connectionId),
                    GSI1SK: tournPK(tournId),
                    connection_id: connectionId,
                    tourn_id: tournId,
                    user_id: userId,
                    joined_at: now,
                    ttl: Math.floor(now / 1000) + TTL_SECONDS,
                },
            }),
        );
    }

    async byConnectionId(
        connectionId: string,
    ): Promise<TournConnRow | null> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                IndexName: "GSI1",
                KeyConditionExpression:
                    "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": connGSI1PK(connectionId),
                    ":sk": "TOURN#",
                },
                Limit: 1,
            }),
        );
        return (r.Items?.[0] as TournConnRow | undefined) ?? null;
    }

    async listByTournament(tournId: string): Promise<string[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression:
                    "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": tournPK(tournId),
                    ":sk": "CONN#",
                },
            }),
        );
        return (r.Items ?? []).map((i) => i.connection_id as string);
    }

    async listByUserInTournament(
        tournId: string,
        userId: string,
    ): Promise<string[]> {
        const all = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression:
                    "PK = :pk AND begins_with(SK, :sk)",
                FilterExpression: "user_id = :uid",
                ExpressionAttributeValues: {
                    ":pk": tournPK(tournId),
                    ":sk": "CONN#",
                    ":uid": userId,
                },
            }),
        );
        return (all.Items ?? []).map((i) => i.connection_id as string);
    }

    async delete(tournId: string, connectionId: string): Promise<void> {
        await this.client.send(
            new DeleteCommand({
                TableName: TABLE,
                Key: {
                    PK: tournPK(tournId),
                    SK: tournConnSK(connectionId),
                },
            }),
        );
    }
}

export const tournConnections = new TournConnectionRepo();
