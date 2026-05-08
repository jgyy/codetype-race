// cron/selectDailySnippet.ts
import {
  DynamoDBDocumentClient as DynamoDBDocumentClient3,
  ScanCommand
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient as DynamoDBClient2 } from "@aws-sdk/client-dynamodb";

// ../shared/src/ddb-keys.ts
var snippetPK = (snippetId) => `SNIPPET#${snippetId}`;
var dailyPK = (date) => `DAILY#${date}`;
var dailyMetaSK = () => "META";
var dailyUserSK = (userId) => `USER#${userId}`;
var WPM_PAD_WIDTH = 5;
var WPM_BIAS = 99999;
var dailyRunSK = (wpm, userId) => {
  const inverted = Math.max(0, WPM_BIAS - Math.floor(wpm));
  return `RUN#${String(inverted).padStart(WPM_PAD_WIDTH, "0")}#${userId}`;
};

// src/repos/DailyRepo.ts
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";

// src/ddb.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
var client = new DynamoDBClient({});
var ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});
var TABLE = process.env.TABLE_NAME;

// src/repos/DailyRepo.ts
var DailyRepo = class {
  constructor(client2 = ddb) {
    this.client = client2;
  }
  async getMeta(date) {
    const r = await this.client.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: dailyPK(date), SK: dailyMetaSK() }
      })
    );
    return r.Item ?? null;
  }
  async putMetaIfMissing(date, snippetId) {
    try {
      await this.client.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            PK: dailyPK(date),
            SK: dailyMetaSK(),
            date,
            snippet_id: snippetId,
            selected_at: Date.now()
          },
          ConditionExpression: "attribute_not_exists(PK)"
        })
      );
      return true;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) return false;
      throw e;
    }
  }
  async getUser(date, userId) {
    const r = await this.client.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: dailyPK(date), SK: dailyUserSK(userId) }
      })
    );
    return r.Item ?? null;
  }
  async submitBest(date, userId, displayName, scaledWpm) {
    const existing = await this.getUser(date, userId);
    if (existing && existing.scaled_wpm >= scaledWpm) {
      return { improved: false, bestWpm: existing.scaled_wpm };
    }
    const finishedAt = Date.now();
    const newRunSK = dailyRunSK(scaledWpm, userId);
    const transactItems = [];
    if (existing?.rate_run_sk) {
      transactItems.push({
        Delete: {
          TableName: TABLE,
          Key: { PK: dailyPK(date), SK: existing.rate_run_sk }
        }
      });
    }
    transactItems.push({
      Put: {
        TableName: TABLE,
        Item: {
          PK: dailyPK(date),
          SK: newRunSK,
          user_id: userId,
          display_name: displayName,
          scaled_wpm: scaledWpm,
          finished_at: finishedAt
        }
      }
    });
    transactItems.push({
      Put: {
        TableName: TABLE,
        Item: {
          PK: dailyPK(date),
          SK: dailyUserSK(userId),
          user_id: userId,
          display_name: displayName,
          scaled_wpm: scaledWpm,
          finished_at: finishedAt,
          rate_run_sk: newRunSK
        }
      }
    });
    await this.client.send(
      new TransactWriteCommand({ TransactItems: transactItems })
    );
    return { improved: true, bestWpm: scaledWpm };
  }
  async listRuns(date, limit = 100) {
    const r = await this.client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": dailyPK(date),
          ":sk": "RUN#"
        },
        Limit: limit
      })
    );
    return r.Items ?? [];
  }
};
var daily = new DailyRepo();
function todayUTC(now = /* @__PURE__ */ new Date()) {
  return now.toISOString().slice(0, 10);
}

// cron/selectDailySnippet.ts
var ddbRaw = new DynamoDBClient2({});
var ddb2 = DynamoDBDocumentClient3.from(ddbRaw);
var TABLE2 = process.env.TABLE_NAME;
async function listAllSnippets() {
  const items = [];
  let lastKey;
  do {
    const r = await ddb2.send(
      new ScanCommand({
        TableName: TABLE2,
        FilterExpression: "begins_with(PK, :pk) AND SK = :sk",
        ExpressionAttributeValues: { ":pk": "SNIPPET#", ":sk": "META" },
        ExclusiveStartKey: lastKey
      })
    );
    items.push(...r.Items ?? []);
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  return items;
}
async function recentDailySnippetIds() {
  const out = /* @__PURE__ */ new Set();
  const today = todayUTC();
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  for (let i = 1; i <= 30; i++) {
    const d = new Date(todayMs - i * 864e5);
    const meta = await daily.getMeta(d.toISOString().slice(0, 10));
    if (meta?.snippet_id) out.add(meta.snippet_id);
  }
  return out;
}
var handler = async () => {
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
        date
      })
    );
    return;
  }
  const all = await listAllSnippets();
  if (all.length === 0) throw new Error("no snippets to select from");
  const recent = await recentDailySnippetIds();
  let pool = all.filter((s) => !recent.has(s.snippet_id));
  if (pool.length === 0) pool = all;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const wrote = await daily.putMetaIfMissing(date, pick.snippet_id);
  console.log(
    JSON.stringify({
      feature: "daily",
      route: "cron:selectDailySnippet",
      status: 200,
      ms: Date.now() - start,
      date,
      snippet_id: pick.snippet_id,
      wrote
    })
  );
};
export {
  handler
};
