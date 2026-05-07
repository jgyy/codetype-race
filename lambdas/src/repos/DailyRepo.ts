import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  dailyMetaSK,
  dailyPK,
  dailyRunSK,
  dailyUserSK,
} from "@codetype/shared/ddb-keys";
import type { DailyMeta } from "@codetype/shared/schemas";
import { ddb, TABLE } from "../ddb";

export interface DailyUserRow {
  user_id: string;
  display_name: string;
  scaled_wpm: number;
  finished_at: number;
  rate_run_sk?: string;
}

export interface DailyRunRow {
  user_id: string;
  display_name: string;
  scaled_wpm: number;
  finished_at: number;
}

export class DailyRepo {
  constructor(private readonly client: DynamoDBDocumentClient = ddb) {}

  async getMeta(date: string): Promise<DailyMeta | null> {
    const r = await this.client.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: dailyPK(date), SK: dailyMetaSK() },
      }),
    );
    return (r.Item as DailyMeta | undefined) ?? null;
  }

  /**
   * Idempotent insert of the daily META. attribute_not_exists prevents
   * a re-run of the cron from clobbering an existing pick.
   */
  async putMetaIfMissing(date: string, snippetId: string): Promise<boolean> {
    try {
      await this.client.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            PK: dailyPK(date),
            SK: dailyMetaSK(),
            date,
            snippet_id: snippetId,
            selected_at: Date.now(),
          },
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
      return true;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) return false;
      throw e;
    }
  }

  async getUser(date: string, userId: string): Promise<DailyUserRow | null> {
    const r = await this.client.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: dailyPK(date), SK: dailyUserSK(userId) },
      }),
    );
    return (r.Item as DailyUserRow | undefined) ?? null;
  }

  /**
   * Best-only submit: if the new wpm beats the user's current best for
   * this date, atomically swap their RUN# row and update the USER#
   * pointer; otherwise no-op.
   */
  async submitBest(
    date: string,
    userId: string,
    displayName: string,
    scaledWpm: number,
  ): Promise<{ improved: boolean; bestWpm: number }> {
    const existing = await this.getUser(date, userId);
    if (existing && existing.scaled_wpm >= scaledWpm) {
      return { improved: false, bestWpm: existing.scaled_wpm };
    }
    const finishedAt = Date.now();
    const newRunSK = dailyRunSK(scaledWpm, userId);

    const transactItems: any[] = [];
    if (existing?.rate_run_sk) {
      transactItems.push({
        Delete: {
          TableName: TABLE,
          Key: { PK: dailyPK(date), SK: existing.rate_run_sk },
        },
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
          finished_at: finishedAt,
        },
      },
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
          rate_run_sk: newRunSK,
        },
      },
    });

    await this.client.send(
      new TransactWriteCommand({ TransactItems: transactItems }),
    );
    return { improved: true, bestWpm: scaledWpm };
  }

  async listRuns(date: string, limit = 100): Promise<DailyRunRow[]> {
    const r = await this.client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": dailyPK(date),
          ":sk": "RUN#",
        },
        Limit: limit,
      }),
    );
    return (r.Items as DailyRunRow[] | undefined) ?? [];
  }
}

export const daily = new DailyRepo();

export function todayUTC(now = new Date()): string {
  // ISO-style YYYY-MM-DD in UTC.
  return now.toISOString().slice(0, 10);
}
