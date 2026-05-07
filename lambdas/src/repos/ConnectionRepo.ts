import {
    DynamoDBDocumentClient,
    DeleteCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
    connGSI1PK,
    connSK,
    roomPK,
} from "@codetype/shared/ddb-keys";
import { ddb, TABLE } from "../ddb";
import { Errors } from "../AppError";
import { metrics } from "../metrics";

const TTL_SECONDS = 30;
const CHAT_WINDOW_MS = 10_000;
const CHAT_MAX_PER_WINDOW = 5;

export interface ConnRow {
    connection_id: string;
    display_name: string;
    joined_at: number;
    ttl: number;
    role?: "racer" | "spectator";
    PK: string;
    SK: string;
}

export class ConnectionRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) { }

    async put(
        roomId: string,
        connectionId: string,
        displayName: string,
        role: "racer" | "spectator" = "racer",
    ): Promise<void> {
        const now = Date.now();
        await this.client.send(
            new PutCommand({
                TableName: TABLE,
                Item: {
                    PK: roomPK(roomId),
                    SK: connSK(connectionId),
                    GSI1PK: connGSI1PK(connectionId),
                    GSI1SK: roomPK(roomId),
                    connection_id: connectionId,
                    display_name: displayName,
                    joined_at: now,
                    ttl: Math.floor(now / 1000) + TTL_SECONDS,
                    role,
                },
            }),
        );
    }

    async byConnectionId(connectionId: string): Promise<ConnRow | null> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                IndexName: "GSI1",
                KeyConditionExpression: "GSI1PK = :pk",
                ExpressionAttributeValues: { ":pk": connGSI1PK(connectionId) },
                Limit: 1,
            }),
        );
        return (r.Items?.[0] as ConnRow | undefined) ?? null;
    }

    async listByRoom(roomId: string): Promise<string[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: { ":pk": roomPK(roomId), ":sk": "CONN#" },
            }),
        );
        return (r.Items ?? []).map((i) => i.connection_id as string);
    }

    async delete(pk: string, sk: string): Promise<void> {
        await this.client.send(
            new DeleteCommand({ TableName: TABLE, Key: { PK: pk, SK: sk } }),
        );
    }

    async consumeChatToken(roomId: string, connectionId: string): Promise<void> {
        const conn = await this.byConnectionId(connectionId);
        if (!conn) throw Errors.NotFound("connection");
        const now = Date.now();
        const row = conn as ConnRow & {
            rate_window_start?: number;
            rate_count?: number;
        };
        const windowStart = row.rate_window_start ?? 0;
        const count = row.rate_count ?? 0;
        const expired = now - windowStart > CHAT_WINDOW_MS;
        const nextStart = expired ? now : windowStart;
        const nextCount = expired ? 1 : count + 1;
        if (nextCount > CHAT_MAX_PER_WINDOW) {
      metrics.chatRateLimited();
      throw Errors.RateLimited();
    }
        try {
            await this.client.send(
                new UpdateCommand({
                    TableName: TABLE,
                    Key: { PK: roomPK(roomId), SK: connSK(connectionId) },
                    UpdateExpression:
                        "SET rate_window_start = :ws, rate_count = :rc",
                    ConditionExpression:
                        "(attribute_not_exists(rate_window_start) AND attribute_not_exists(rate_count)) OR " +
                        "(rate_window_start = :oldStart AND rate_count = :oldCount)",
                    ExpressionAttributeValues: {
                        ":ws": nextStart,
                        ":rc": nextCount,
                        ":oldStart": windowStart,
                        ":oldCount": count,
                    },
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw Errors.RateLimited();
            }
            throw e;
        }
    }

    async touch(roomId: string, connectionId: string): Promise<void> {
        await this.client.send(
            new UpdateCommand({
                TableName: TABLE,
                Key: { PK: roomPK(roomId), SK: connSK(connectionId) },
                UpdateExpression: "SET #ttl = :t",
                ExpressionAttributeNames: { "#ttl": "ttl" },
                ExpressionAttributeValues: {
                    ":t": Math.floor(Date.now() / 1000) + TTL_SECONDS,
                },
            }),
        );
    }
}

export const connections = new ConnectionRepo();
