import {
  DynamoDBDocumentClient,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { Snippet } from "@codetype/shared/schemas";
import { snippetPK } from "@codetype/shared/ddb-keys";
import { daily, todayUTC } from "../src/repos/DailyRepo";

// Cron handler: pick a snippet for today and write the daily META row.
// Idempotent: re-runs on the same date are no-ops thanks to
// `putMetaIfMissing`.
//
// Selection rules:
//   1. List all snippets.
//   2. Exclude any snippet picked in the last 30 daily META rows.
//   3. If the filtered set is empty, fall back to the full list.
//   4. Pick uniformly from that pool.
//
// Weighting by difficulty is left for a future enhancement once the
// snippet pool is large enough that "popular language" hot-partitioning
// would matter.

const ddbRaw = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbRaw);
const TABLE = process.env.TABLE_NAME!;

async function listAllSnippets(): Promise<Snippet[]> {
  const items: Snippet[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const r: any = await ddb.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "begins_with(PK, :pk) AND SK = :sk",
        ExpressionAttributeValues: { ":pk": "SNIPPET#", ":sk": "META" },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...((r.Items as Snippet[] | undefined) ?? []));
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function recentDailySnippetIds(): Promise<Set<string>> {
  const out = new Set<string>();
  const today = todayUTC();
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  for (let i = 1; i <= 30; i++) {
    const d = new Date(todayMs - i * 86_400_000);
    const meta = await daily.getMeta(d.toISOString().slice(0, 10));
    if (meta?.snippet_id) out.add(meta.snippet_id);
  }
  return out;
}

export const handler = async () => {
  const date = todayUTC();
  const start = Date.now();

  const existing = await daily.getMeta(date);
  if (existing) {
    console.log(
      JSON.stringify({
        feature: "daily",
        route: "cron:selectDailySnippet",
        status: 200,
        ms: Date.now() - start,
        message: "already selected",
        date,
      }),
    );
    return;
  }

  const all = await listAllSnippets();
  if (all.length === 0) throw new Error("no snippets to select from");

  const recent = await recentDailySnippetIds();
  let pool = all.filter((s) => !recent.has(s.snippet_id));
  if (pool.length === 0) pool = all;
  const pick = pool[Math.floor(Math.random() * pool.length)]!;

  const wrote = await daily.putMetaIfMissing(date, pick.snippet_id);
  console.log(
    JSON.stringify({
      feature: "daily",
      route: "cron:selectDailySnippet",
      status: 200,
      ms: Date.now() - start,
      date,
      snippet_id: pick.snippet_id,
      wrote,
    }),
  );
  void snippetPK; // silence unused-import if linter complains
};
