import {
    DynamoDBDocumentClient,
    QueryCommand,
    TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
    teamRatingPK,
    teamRatingSK,
    teamRatingUserGSI1PK,
    teamRatingUserGSI1SK,
} from "@codetype/shared/ddb-keys";
import { TEAM_STARTING_RATING } from "@codetype/shared/social";
import { ddb, TABLE } from "../ddb";

export interface TeamRatingRow {
    PK: string;
    SK: string;
    GSI1PK: string;
    GSI1SK: string;
    user_id: string;
    language: string;
    rating: number;
    games: number;
    display_name: string;
}

export interface TeamRatingApplyInput {
    userId: string;
    displayName: string;
    language: string;
    delta: number;
    /** Pre-fetched rating before the delta — comes from getOrInit. */
    oldRating: number;
}

export class TeamRatingRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) { }

    async getOrInit(
        userId: string,
        displayName: string,
        language: string,
    ): Promise<TeamRatingRow> {
        const existing = await this.lookup(userId, language);
        if (existing) return existing;
        const row: TeamRatingRow = {
            PK: teamRatingPK(language),
            SK: teamRatingSK(TEAM_STARTING_RATING, userId),
            GSI1PK: teamRatingUserGSI1PK(userId),
            GSI1SK: teamRatingUserGSI1SK(language),
            user_id: userId,
            display_name: displayName,
            language,
            rating: TEAM_STARTING_RATING,
            games: 0,
        };
        try {
            await this.client.send(
                new TransactWriteCommand({
                    TransactItems: [
                        {
                            Put: {
                                TableName: TABLE,
                                Item: row,
                                ConditionExpression: "attribute_not_exists(PK)",
                            },
                        },
                    ],
                }),
            );
        } catch (e) {
            if (e instanceof TransactionCanceledException) {
                const again = await this.lookup(userId, language);
                if (again) return again;
            }
            throw e;
        }
        return row;
    }

    async lookup(
        userId: string,
        language: string,
    ): Promise<TeamRatingRow | null> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                IndexName: "GSI1",
                KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
                ExpressionAttributeValues: {
                    ":pk": teamRatingUserGSI1PK(userId),
                    ":sk": teamRatingUserGSI1SK(language),
                },
                Limit: 1,
            }),
        );
        return (r.Items?.[0] as TeamRatingRow | undefined) ?? null;
    }

    /**
     * Apply per-player deltas in a single TransactWriteItems together
     * with an idempotency flag on the room. Caller passes an
     * already-fetched `oldRating` per player so we can rotate the
     * inverted-rating SK in one transaction.
     */
    /**
     * Build the TransactWriteItems for "apply per-player team-rating
     * deltas + idempotency flag." Caller composes these with race
     * history items so the entire team-race finalization is one
     * transaction (spec acceptance criterion).
     */
    buildApplyItems(roomId: string, applies: TeamRatingApplyInput[]): any[] {
        const items: any[] = [
            {
                Update: {
                    TableName: TABLE,
                    Key: { PK: `ROOM#${roomId}`, SK: "META" },
                    UpdateExpression: "SET team_elo_applied = :t",
                    ConditionExpression:
                        "attribute_not_exists(team_elo_applied)",
                    ExpressionAttributeValues: { ":t": true },
                },
            },
        ];
        for (const a of applies) {
            const newRating = a.oldRating + a.delta;
            items.push({
                Delete: {
                    TableName: TABLE,
                    Key: {
                        PK: teamRatingPK(a.language),
                        SK: teamRatingSK(a.oldRating, a.userId),
                    },
                },
            });
            items.push({
                Put: {
                    TableName: TABLE,
                    Item: {
                        PK: teamRatingPK(a.language),
                        SK: teamRatingSK(newRating, a.userId),
                        GSI1PK: teamRatingUserGSI1PK(a.userId),
                        GSI1SK: teamRatingUserGSI1SK(a.language),
                        user_id: a.userId,
                        display_name: a.displayName,
                        language: a.language,
                        rating: newRating,
                        games: 0,
                    },
                },
            });
        }
        return items;
    }

    async sendTransaction(items: any[]): Promise<void> {
        if (items.length === 0) return;
        await this.client.send(new TransactWriteCommand({ TransactItems: items }));
    }
}

export const teamRatings = new TeamRatingRepo();
