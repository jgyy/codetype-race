// User profile + Elo rating storage. Wired in Phase 06; the repo is
// scaffolded now so handlers (when they need it) won't talk to DDB
// directly. No handler currently consumes this — it's intentionally
// minimal and untested at the integration level.

import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "../ddb";

const userPK = (userId: string) => `USER#${userId}`;
const userMetaSK = () => "META";

export interface UserProfile {
  user_id: string;
  display_name: string;
  rating: number;
  races: number;
  created_at: number;
}

export class UserRepo {
  constructor(private readonly client: DynamoDBDocumentClient = ddb) {}

  async getProfile(userId: string): Promise<UserProfile | null> {
    const r = await this.client.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: userPK(userId), SK: userMetaSK() },
      }),
    );
    return (r.Item as UserProfile | undefined) ?? null;
  }

  async getOrCreate(userId: string, displayName: string): Promise<UserProfile> {
    const existing = await this.getProfile(userId);
    if (existing) return existing;
    const profile: UserProfile = {
      user_id: userId,
      display_name: displayName,
      rating: 1000,
      races: 0,
      created_at: Date.now(),
    };
    await this.client.send(
      new PutCommand({
        TableName: TABLE,
        Item: { PK: userPK(userId), SK: userMetaSK(), ...profile },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    return profile;
  }

  async updateRating(userId: string, rating: number): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: userPK(userId), SK: userMetaSK() },
        UpdateExpression: "SET rating = :r ADD races :one",
        ExpressionAttributeValues: { ":r": rating, ":one": 1 },
      }),
    );
  }

  async recordRace(userId: string, finishedAt: number, scaledWpm: number): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: userPK(userId),
          SK: `RACE#${finishedAt}`,
          finished_at: finishedAt,
          scaled_wpm: scaledWpm,
        },
      }),
    );
  }
}

export const users = new UserRepo();
