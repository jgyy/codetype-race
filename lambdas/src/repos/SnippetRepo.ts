import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  langGSI1PK,
  snippetDiffPrefix,
  snippetPK,
} from "@codetype/shared/ddb-keys";
import type {
  Snippet,
  SnippetFilters,
} from "@codetype/shared/schemas";
import { ddb, TABLE } from "../ddb";

const RANDOM_PAGE_SIZE = 25;

export class SnippetRepo {
  constructor(
    private readonly client: DynamoDBDocumentClient = ddb,
    private readonly rng: () => number = Math.random,
  ) {}

  async getById(snippetId: string): Promise<Snippet | null> {
    const r = await this.client.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: snippetPK(snippetId), SK: "META" },
      }),
    );
    return (r.Item as Snippet | undefined) ?? null;
  }

  async list(filters: SnippetFilters = {}, limit = 100): Promise<Snippet[]> {
    if (!filters.language) {
      // Without a language filter the index can't be range-scanned cheaply;
      // listings without filters are an admin operation outside scope.
      return [];
    }
    const exprValues: Record<string, unknown> = {
      ":pk": langGSI1PK(filters.language),
    };
    let keyExpr = "GSI1PK = :pk";
    if (filters.difficulty !== undefined) {
      keyExpr += " AND begins_with(GSI1SK, :diff)";
      exprValues[":diff"] = snippetDiffPrefix(filters.difficulty);
    }
    const r = await this.client.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: keyExpr,
        ExpressionAttributeValues: exprValues,
        Limit: limit,
      }),
    );
    return (r.Items as Snippet[] | undefined) ?? [];
  }

  /**
   * Pick a random snippet matching the supplied filters. Reads a
   * bounded page (25) and uniformly samples from it; for current scale
   * this is good enough.
   */
  async random(filters: SnippetFilters = {}): Promise<Snippet | null> {
    const candidates = await this.list(filters, RANDOM_PAGE_SIZE);
    if (candidates.length === 0) return null;
    const idx = Math.floor(this.rng() * candidates.length);
    return candidates[idx] ?? null;
  }
}

export const snippets = new SnippetRepo();
