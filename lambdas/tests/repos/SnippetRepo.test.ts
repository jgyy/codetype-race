import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { SnippetRepo } from "../../src/repos/SnippetRepo";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

describe("SnippetRepo.random", () => {
  test("returns null when no snippets match", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const repo = new SnippetRepo(ddbMock as unknown as DynamoDBDocumentClient);
    expect(await repo.random({ language: "ts" })).toBeNull();
  });

  test("picks deterministically with injected rng", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { snippet_id: "a", language: "ts", title: "A", code: "a", length: 1 },
        { snippet_id: "b", language: "ts", title: "B", code: "b", length: 1 },
        { snippet_id: "c", language: "ts", title: "C", code: "c", length: 1 },
      ],
    });
    const repo = new SnippetRepo(
      ddbMock as unknown as DynamoDBDocumentClient,
      () => 0.5, // index = floor(0.5 * 3) = 1
    );
    const picked = await repo.random({ language: "ts" });
    expect(picked?.snippet_id).toBe("b");
  });

  test("filters by difficulty via begins_with on GSI1SK", async () => {
    let observed: any;
    ddbMock.on(QueryCommand).callsFake((input) => {
      observed = input;
      return Promise.resolve({
        Items: [
          { snippet_id: "x", language: "ts", title: "X", code: "x", length: 1 },
        ],
      });
    });
    const repo = new SnippetRepo(
      ddbMock as unknown as DynamoDBDocumentClient,
      () => 0,
    );
    const picked = await repo.random({ language: "ts", difficulty: 3 });
    expect(picked?.snippet_id).toBe("x");
    expect(observed.KeyConditionExpression).toContain("begins_with");
    expect(observed.ExpressionAttributeValues[":diff"]).toBe("DIFF#3#");
  });

  test("returns [] from list when no language filter", async () => {
    const repo = new SnippetRepo(ddbMock as unknown as DynamoDBDocumentClient);
    const items = await repo.list({});
    expect(items).toEqual([]);
  });
});
