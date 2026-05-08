import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
    ScanCommand,
    TransactWriteCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
    leaderboardGlobalPK,
    leaderboardLangPK,
    ratingSortKey,
    userHandleGSI1PK,
    userHandleGSI1SK,
    userPK,
    userProfileSK,
    userRaceSK,
} from "@codetype/shared/ddb-keys";
import type {
    RaceHistoryEntry,
    UserProfile,
} from "@codetype/shared/schemas";
import { ddb, TABLE } from "../ddb";

export const STARTING_RATING = 1000;

export interface RaceResultInput {
    userId: string;
    displayName: string;
    language: string;
    finishOrder: number;
    scaledWpm: number;
    netWpm: number;
    grossWpm: number;
    accuracy: number;
}

export interface AppliedDelta {
    userId: string;
    displayName: string;
    oldRating: number;
    newRating: number;
    delta: number;
}

export class UserRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) { }

    async getProfile(userId: string): Promise<UserProfile | null> {
        const r = await this.client.send(
            new GetCommand({
                TableName: TABLE,
                Key: { PK: userPK(userId), SK: userProfileSK() },
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
            rating: STARTING_RATING,
            races_completed: 0,
            races_won: 0,
            best_wpm: {},
            created_at: Date.now(),
        };
        try {
            const handleLower = displayName.toLowerCase();
            await this.client.send(
                new PutCommand({
                    TableName: TABLE,
                    Item: {
                        PK: userPK(userId),
                        SK: userProfileSK(),
                        ...profile,
                        // Denormalized handle index. Bucketed GSI1 partition
                        // keyed on first 3 chars; supports begins_with autocomplete.
                        GSI1PK: userHandleGSI1PK(handleLower),
                        GSI1SK: userHandleGSI1SK(handleLower, userId),
                        handle_lower: handleLower,
                    },
                    ConditionExpression: "attribute_not_exists(PK)",
                }),
            );
            await this.client.send(
                new PutCommand({
                    TableName: TABLE,
                    Item: {
                        PK: leaderboardGlobalPK(),
                        SK: ratingSortKey(profile.rating, userId),
                        user_id: userId,
                        display_name: displayName,
                        rating: profile.rating,
                    },
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                const again = await this.getProfile(userId);
                if (again) return again;
            }
            throw e;
        }
        return profile;
    }

    async listRecentRaces(
        userId: string,
        limit = 20,
    ): Promise<RaceHistoryEntry[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": userPK(userId),
                    ":sk": "RACE#",
                },
                ScanIndexForward: false,
                Limit: limit,
            }),
        );
        return (r.Items as RaceHistoryEntry[] | undefined) ?? [];
    }

    async applyRaceResults(
        roomId: string,
        language: string,
        participants: Array<RaceResultInput & { profile: UserProfile; delta: number }>,
    ): Promise<AppliedDelta[]> {
        const now = Date.now();
        const items: any[] = [];
        const applied: AppliedDelta[] = [];

        for (const p of participants) {
            const newRating = p.profile.rating + p.delta;
            const isWin = p.finishOrder === 1;
            const bestForLang = p.profile.best_wpm?.[language] ?? 0;
            const newBest = Math.max(bestForLang, p.scaledWpm);

            items.push({
                Update: {
                    TableName: TABLE,
                    Key: { PK: userPK(p.userId), SK: userProfileSK() },
                    UpdateExpression:
                        "SET rating = :r, races_completed = races_completed + :one, races_won = races_won + :w, best_wpm.#lang = :best",
                    ExpressionAttributeNames: { "#lang": language },
                    ExpressionAttributeValues: {
                        ":r": newRating,
                        ":one": 1,
                        ":w": isWin ? 1 : 0,
                        ":best": newBest,
                    },
                },
            });
            items.push({
                Put: {
                    TableName: TABLE,
                    Item: {
                        PK: userPK(p.userId),
                        SK: userRaceSK(p.finishOrder === 0 ? now : now, roomId),
                        room_id: roomId,
                        finished_at: now,
                        display_name: p.displayName,
                        language,
                        scaled_wpm: p.scaledWpm,
                        net_wpm: p.netWpm,
                        gross_wpm: p.grossWpm,
                        accuracy: p.accuracy,
                        rating_delta: p.delta,
                        rating_after: newRating,
                    },
                },
            });
            items.push({
                Delete: {
                    TableName: TABLE,
                    Key: {
                        PK: leaderboardGlobalPK(),
                        SK: ratingSortKey(p.profile.rating, p.userId),
                    },
                },
            });
            items.push({
                Put: {
                    TableName: TABLE,
                    Item: {
                        PK: leaderboardGlobalPK(),
                        SK: ratingSortKey(newRating, p.userId),
                        user_id: p.userId,
                        display_name: p.displayName,
                        rating: newRating,
                    },
                },
            });
            items.push({
                Delete: {
                    TableName: TABLE,
                    Key: {
                        PK: leaderboardLangPK(language),
                        SK: ratingSortKey(p.profile.rating, p.userId),
                    },
                },
            });
            items.push({
                Put: {
                    TableName: TABLE,
                    Item: {
                        PK: leaderboardLangPK(language),
                        SK: ratingSortKey(newRating, p.userId),
                        user_id: p.userId,
                        display_name: p.displayName,
                        rating: newRating,
                    },
                },
            });

            applied.push({
                userId: p.userId,
                displayName: p.displayName,
                oldRating: p.profile.rating,
                newRating,
                delta: p.delta,
            });
        }

        items.push({
            Update: {
                TableName: TABLE,
                Key: { PK: `ROOM#${roomId}`, SK: "META" },
                UpdateExpression: "SET elo_applied = :t",
                ConditionExpression: "attribute_not_exists(elo_applied)",
                ExpressionAttributeValues: { ":t": true },
            },
        });

        await this.client.send(new TransactWriteCommand({ TransactItems: items }));
        return applied;
    }

    async listLeaderboard(
        pk: string,
        limit = 100,
    ): Promise<Array<{ user_id: string; display_name: string; rating: number }>> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                FilterExpression:
                    "attribute_not_exists(flagged) OR flagged = :falseVal",
                ExpressionAttributeValues: {
                    ":pk": pk,
                    ":sk": "RATING#",
                    ":falseVal": false,
                },
                Limit: limit,
            }),
        );
        return (r.Items as any[] | undefined) ?? [];
    }

    /**
     * Handle-prefix search. The 3-char bucket constraint means queries
     * shorter than 3 chars are rejected upstream; queries 3+ chars hit
     * exactly one GSI1 partition.
     */
    async searchByHandlePrefix(
        prefix: string,
        limit = 25,
    ): Promise<UserProfile[]> {
        const lower = prefix.trim().toLowerCase();
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                IndexName: "GSI1",
                KeyConditionExpression:
                    "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": userHandleGSI1PK(lower),
                    ":sk": lower,
                },
                Limit: limit,
            }),
        );
        return (r.Items as UserProfile[] | undefined) ?? [];
    }

    async pageProfiles(
        startKey: Record<string, unknown> | undefined,
        limit = 100,
    ): Promise<{
        items: UserProfile[];
        nextKey: Record<string, unknown> | undefined;
    }> {
        const r = await this.client.send(
            new ScanCommand({
                TableName: TABLE,
                FilterExpression: "SK = :sk AND begins_with(PK, :pk)",
                ExpressionAttributeValues: {
                    ":sk": "PROFILE",
                    ":pk": "USER#",
                },
                ExclusiveStartKey: startKey,
                Limit: limit,
            }),
        );
        return {
            items: (r.Items as UserProfile[] | undefined) ?? [],
            nextKey: r.LastEvaluatedKey,
        };
    }

    async applyDecayToProfile(
        userId: string,
        newRating: number,
        seasonId: string,
    ): Promise<boolean> {
        try {
            await this.client.send(
                new UpdateCommand({
                    TableName: TABLE,
                    Key: { PK: userPK(userId), SK: userProfileSK() },
                    UpdateExpression:
                        "SET rating = :r, decayAppliedFor = :sid",
                    ConditionExpression:
                        "attribute_not_exists(decayAppliedFor) OR decayAppliedFor <> :sid",
                    ExpressionAttributeValues: {
                        ":r": newRating,
                        ":sid": seasonId,
                    },
                }),
            );
            return true;
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) return false;
            throw e;
        }
    }
}

export const users = new UserRepo();
