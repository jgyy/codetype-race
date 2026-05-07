import {
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { hostGSI1PK } from "@codetype/shared/ddb-keys";
import { ddb, TABLE } from "../ddb";

export class HistoryRepo {
  constructor(private readonly client: DynamoDBDocumentClient = ddb) {}

  async listForHost(hostId: string, limit = 50): Promise<Record<string, unknown>[]> {
    const r = await this.client.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": hostGSI1PK(hostId) },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (r.Items as Record<string, unknown>[] | undefined) ?? [];
  }
}

export const history = new HistoryRepo();
