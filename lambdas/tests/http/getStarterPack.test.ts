import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  process.env.TABLE_NAME = "test-table";
});
afterEach(() => ddbMock.reset());

function makeSnippet(id: string, language = "ts") {
  return {
    snippet_id: id,
    language,
    title: `Snippet ${id}`,
    code: `// ${id}`,
    length: 5,
    difficulty: 2,
  };
}

function event(qs: Record<string, string> = {}) {
  return {
    body: undefined,
    routeKey: "GET /snippets/starter-pack",
    pathParameters: undefined,
    queryStringParameters: qs,
    requestContext: { requestId: "req", http: { method: "GET", path: "/snippets/starter-pack" } },
  } as never;
}

describe("GET /snippets/starter-pack", () => {
  test("returns up to N snippets with no language filter (Scan path)", async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: Array.from({ length: 12 }, (_, i) => makeSnippet(`s${i}`)),
    });
    const { handler } = await import("../../http/getStarterPack");
    const res = await handler(event({ n: "5" }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body!);
    expect(body.snippets).toHaveLength(5);
  });

  test("respects multi-language fanout and dedupes by snippet_id", async () => {
    ddbMock.on(QueryCommand).callsFake((input) => {
      const pk = (input.ExpressionAttributeValues?.[":pk"] as string) ?? "";
      const lang = pk.split("#")[1] ?? "x";
      // Each language returns 4 items; "shared" id appears in both langs.
      return Promise.resolve({
        Items: [
          makeSnippet(`${lang}-a`, lang),
          makeSnippet(`${lang}-b`, lang),
          makeSnippet("shared", lang),
        ],
      });
    });
    const { handler } = await import("../../http/getStarterPack");
    const res = await handler(event({ languages: "ts,py", n: "10" }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body!);
    const ids = body.snippets.map((s: { snippet_id: string }) => s.snippet_id);
    expect(new Set(ids).size).toBe(ids.length); // no dupes
    expect(ids).toContain("shared");
  });

  test("clamps n to [1, 100]", async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: Array.from({ length: 5 }, (_, i) => makeSnippet(`s${i}`)),
    });
    const { handler } = await import("../../http/getStarterPack");
    const tooMany = await handler(event({ n: "500" }));
    expect(tooMany.statusCode).toBe(200);
    const tooFew = await handler(event({ n: "0" }));
    expect(tooFew.statusCode).toBe(200);
  });
});
