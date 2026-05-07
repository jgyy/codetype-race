import {
  DynamoDBDocumentClient,
  DeleteCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  connGSI1PK,
  connSK,
  roomPK,
} from "@codetype/shared/ddb-keys";
import { ddb, TABLE } from "../ddb";

const TTL_SECONDS = 30;

export interface ConnRow {
  connection_id: string;
  display_name: string;
  joined_at: number;
  ttl: number;
  PK: string;
  SK: string;
}

export class ConnectionRepo {
  constructor(private readonly client: DynamoDBDocumentClient = ddb) {}

  async put(roomId: string, connectionId: string, displayName: string): Promise<void> {
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
