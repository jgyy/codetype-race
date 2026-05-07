#!/usr/bin/env bun
// Idempotent seed of data/snippets.json into the codetype DDB table.
// Usage: AWS_PROFILE=your_profile bun scripts/seed-snippets.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import snippets from "../data/snippets.json" with { type: "json" };

const TABLE = process.env.TABLE_NAME ?? "codetype";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DEFAULT_DIFFICULTY = 3;

for (const s of snippets) {
    const difficulty = (s as { difficulty?: number }).difficulty ?? DEFAULT_DIFFICULTY;
    const tags = (s as { tags?: string[] }).tags ?? [];
    await ddb.send(
        new PutCommand({
            TableName: TABLE,
            Item: {
                PK: `SNIPPET#${s.snippet_id}`,
                SK: "META",
                GSI1PK: `LANG#${s.language}`,
                GSI1SK: `DIFF#${difficulty}#SNIPPET#${s.snippet_id}`,
                snippet_id: s.snippet_id,
                language: s.language,
                title: s.title,
                code: s.code,
                length: s.code.length,
                difficulty,
                tags,
            },
        }),
    );
    console.log(
        `seeded ${s.snippet_id} (${s.code.length} chars, diff ${difficulty})`,
    );
}
