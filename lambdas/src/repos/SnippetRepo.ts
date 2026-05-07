import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { langGSI1PK, snippetPK } from "@codetype/shared/ddb-keys";
import type { Snippet } from "@codetype/shared/schemas";
import { ddb, TABLE } from "../ddb";

export class SnippetRepo {
  constructor(private readonly client: DynamoDBDocumentClient = ddb) {}

  async getById(snippetId: string): Promise<Snippet | null> {
    const r = await this.client.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: snippetPK(snippetId), SK: "META" },
      }),
    );
    return (r.Item as Snippet | undefined) ?? null;
  }

  async listByLanguage(language: string, limit = 50): Promise<Snippet[]> {
    const r = await this.client.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": langGSI1PK(language) },
        Limit: limit,
      }),
    );
    return (r.Items as Snippet[] | undefined) ?? [];
  }
}

export const snippets = new SnippetRepo();
