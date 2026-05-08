import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
    BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
    seasonLbPK,
    seasonLbSK,
    seasonMetaSK,
    seasonPK,
    seasonStatusGSI1PK,
} from "@codetype/shared/ddb-keys";
import type {
    Season,
    SeasonLeaderboardRow,
    SeasonStatus,
} from "@codetype/shared/tournaments";
import { ddb, TABLE } from "../ddb";
import { Errors } from "../AppError";

export class SeasonRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) {}

    async create(season: Season): Promise<void> {
        try {
            await this.client.send(
                new PutCommand({
                    TableName: TABLE,
                    Item: {
                        PK: seasonPK(season.id),
                        SK: seasonMetaSK(),
                        GSI1PK: seasonStatusGSI1PK(season.status),
                        GSI1SK: season.startsAt,
                        ...season,
                    },
                    ConditionExpression: "attribute_not_exists(PK)",
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw Errors.Conflict(`season ${season.id} already exists`);
            }
            throw e;
        }
    }

    async get(id: string): Promise<Season | null> {
        const r = await this.client.send(
            new GetCommand({
                TableName: TABLE,
                Key: { PK: seasonPK(id), SK: seasonMetaSK() },
            }),
        );
        return (r.Item as Season | undefined) ?? null;
    }

    async listByStatus(status: SeasonStatus): Promise<Season[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                IndexName: "GSI1",
                KeyConditionExpression: "GSI1PK = :pk",
                ExpressionAttributeValues: {
                    ":pk": seasonStatusGSI1PK(status),
                },
            }),
        );
        return (r.Items as Season[] | undefined) ?? [];
    }

    /**
     * CAS status transition. Returns false if the current status doesn't match
     * `from` (another invocation already moved it).
     */
    async transitionStatus(
        id: string,
        from: SeasonStatus,
        to: SeasonStatus,
    ): Promise<boolean> {
        try {
            await this.client.send(
                new UpdateCommand({
                    TableName: TABLE,
                    Key: { PK: seasonPK(id), SK: seasonMetaSK() },
                    UpdateExpression:
                        "SET #s = :to, GSI1PK = :gsi",
                    ConditionExpression: "#s = :from",
                    ExpressionAttributeNames: { "#s": "status" },
                    ExpressionAttributeValues: {
                        ":from": from,
                        ":to": to,
                        ":gsi": seasonStatusGSI1PK(to),
                    },
                }),
            );
            return true;
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) return false;
            throw e;
        }
    }

    /**
     * Write a frozen leaderboard row. Uses attribute_not_exists so an already-
     * archived season's leaderboard is read-only (acceptance criterion).
     */
    async putLeaderboardRow(row: SeasonLeaderboardRow): Promise<void> {
        try {
            await this.client.send(
                new PutCommand({
                    TableName: TABLE,
                    Item: {
                        PK: seasonLbPK(row.seasonId, row.language),
                        SK: seasonLbSK(row.rank),
                        ...row,
                    },
                    ConditionExpression: "attribute_not_exists(PK)",
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw Errors.Conflict(
                    `leaderboard row ${row.seasonId}/${row.language}/${row.rank} already frozen`,
                );
            }
            throw e;
        }
    }

    async getLeaderboard(
        seasonId: string,
        language: string,
        limit = 100,
    ): Promise<SeasonLeaderboardRow[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk",
                ExpressionAttributeValues: {
                    ":pk": seasonLbPK(seasonId, language),
                },
                Limit: limit,
            }),
        );
        return (r.Items as SeasonLeaderboardRow[] | undefined) ?? [];
    }
}

export const seasons = new SeasonRepo();
