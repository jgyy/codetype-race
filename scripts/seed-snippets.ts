#!/usr/bin/env bun
// One-time seed of data/snippets.json into the codetype DDB table.
// Usage: AWS_PROFILE=jgyy bun scripts/seed-snippets.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import snippets from "../data/snippets.json" with { type: "json" };

const TABLE = process.env.TABLE_NAME ?? "codetype";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

for (const s of snippets) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `SNIPPET#${s.snippet_id}`,
        SK: "META",
        GSI1PK: `LANG#${s.language}`,
        GSI1SK: `SNIPPET#${s.snippet_id}`,
        snippet_id: s.snippet_id,
        language: s.language,
        title: s.title,
        code: s.code,
        length: s.code.length,
      },
    }),
  );
  console.log(`seeded ${s.snippet_id} (${s.code.length} chars)`);
}
