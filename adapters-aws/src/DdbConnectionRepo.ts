import {
    type DynamoDBDocumentClient,
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
import {
    DomainError,
    type ConnectionRecord,
    type ConnectionRepo,
} from "@codetype/domain";
import { queryGsiThenHydrate } from "./queryGsiThenHydrate";

export interface DdbConnectionRepoConfig {
    table: string;
    client: DynamoDBDocumentClient;
}

const TTL_SECONDS = 30;
const CHAT_WINDOW_MS = 10_000;
const CHAT_MAX_PER_WINDOW = 5;

export class DdbConnectionRepo implements ConnectionRepo {
    constructor(private readonly cfg: DdbConnectionRepoConfig) { }

    async put(
        roomId: string,
        connectionId: string,
        displayName: string,
        role: "racer" | "spectator",
        opts: { cursor_lite?: boolean },
    ): Promise<void> {
        const now = Date.now();
        await this.cfg.client.send(
            new PutCommand({
                TableName: this.cfg.table,
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
                    ...(opts.cursor_lite ? { cursor_lite: true } : {}),
                },
            }),
        );
    }

    async byConnectionId(
        connectionId: string,
    ): Promise<ConnectionRecord | null> {
        const items = await queryGsiThenHydrate<ConnectionRecord>(
            this.cfg.client,
            this.cfg.table,
            {
                TableName: this.cfg.table,
                IndexName: "GSI1",
                KeyConditionExpression: "GSI1PK = :pk",
                ExpressionAttributeValues: { ":pk": connGSI1PK(connectionId) },
                Limit: 1,
            },
        );
        return items[0] ?? null;
    }

    async listByRoom(roomId: string): Promise<string[]> {
        const r = await this.cfg.client.send(
            new QueryCommand({
                TableName: this.cfg.table,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": roomPK(roomId),
                    ":sk": "CONN#",
                },
            }),
        );
        return (r.Items ?? []).map((i) => i.connection_id as string);
    }

    async delete(pk: string, sk: string): Promise<void> {
        await this.cfg.client.send(
            new DeleteCommand({
                TableName: this.cfg.table,
                Key: { PK: pk, SK: sk },
            }),
        );
    }

    async touch(roomId: string, connectionId: string): Promise<void> {
        await this.cfg.client.send(
            new UpdateCommand({
                TableName: this.cfg.table,
                Key: { PK: roomPK(roomId), SK: connSK(connectionId) },
                UpdateExpression: "SET #ttl = :t",
                ExpressionAttributeNames: { "#ttl": "ttl" },
                ExpressionAttributeValues: {
                    ":t": Math.floor(Date.now() / 1000) + TTL_SECONDS,
                },
            }),
        );
    }

    async consumeChatToken(
        roomId: string,
        connectionId: string,
    ): Promise<void> {
        const conn = await this.byConnectionId(connectionId);
        if (!conn) throw new DomainError("connection.not_found", 404);
        const now = Date.now();
        const row = conn as ConnectionRecord & {
            rate_window_start?: number;
            rate_count?: number;
        };
        const windowStart = row.rate_window_start ?? 0;
        const count = row.rate_count ?? 0;
        const expired = now - windowStart > CHAT_WINDOW_MS;
        const nextStart = expired ? now : windowStart;
        const nextCount = expired ? 1 : count + 1;
        if (nextCount > CHAT_MAX_PER_WINDOW) {
            throw new DomainError("chat.rate_limited", 429);
        }
        try {
            await this.cfg.client.send(
                new UpdateCommand({
                    TableName: this.cfg.table,
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
                throw new DomainError("chat.rate_limited", 429);
            }
            throw e;
        }
    }
}
