import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
    DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
    tournEntrantSK,
    tournMetaSK,
    tournPK,
    tournStatusGSI1PK,
    tournUserGSI1SK,
    userPK,
} from "@codetype/shared/ddb-keys";
import type {
    Tournament,
    TournamentEntrant,
    TournamentStatus,
} from "@codetype/shared/tournaments";
import { ddb, TABLE } from "../ddb";
import { Errors } from "../AppError";

export class TournamentRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) {}

    async create(t: Tournament): Promise<void> {
        try {
            await this.client.send(
                new PutCommand({
                    TableName: TABLE,
                    Item: {
                        PK: tournPK(t.id),
                        SK: tournMetaSK(),
                        GSI1PK: tournStatusGSI1PK(t.status),
                        GSI1SK: t.startsAt,
                        ...t,
                    },
                    ConditionExpression: "attribute_not_exists(PK)",
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw Errors.Conflict(`tournament ${t.id} already exists`);
            }
            throw e;
        }
    }

    async get(id: string): Promise<Tournament | null> {
        const r = await this.client.send(
            new GetCommand({
                TableName: TABLE,
                Key: { PK: tournPK(id), SK: tournMetaSK() },
            }),
        );
        return (r.Item as Tournament | undefined) ?? null;
    }

    async listByStatus(status: TournamentStatus): Promise<Tournament[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                IndexName: "GSI1",
                KeyConditionExpression: "GSI1PK = :pk",
                ExpressionAttributeValues: {
                    ":pk": tournStatusGSI1PK(status),
                },
            }),
        );
        return (r.Items as Tournament[] | undefined) ?? [];
    }

    async transitionStatus(
        id: string,
        from: TournamentStatus,
        to: TournamentStatus,
        extra: Record<string, unknown> = {},
    ): Promise<boolean> {
        const sets = ["#s = :to", "GSI1PK = :gsi"];
        const values: Record<string, unknown> = {
            ":from": from,
            ":to": to,
            ":gsi": tournStatusGSI1PK(to),
        };
        const names: Record<string, string> = { "#s": "status" };
        let i = 0;
        for (const [k, v] of Object.entries(extra)) {
            const n = `#x${i}`;
            const ph = `:x${i}`;
            sets.push(`${n} = ${ph}`);
            names[n] = k;
            values[ph] = v;
            i++;
        }
        try {
            await this.client.send(
                new UpdateCommand({
                    TableName: TABLE,
                    Key: { PK: tournPK(id), SK: tournMetaSK() },
                    UpdateExpression: `SET ${sets.join(", ")}`,
                    ConditionExpression: "#s = :from",
                    ExpressionAttributeNames: names,
                    ExpressionAttributeValues: values,
                }),
            );
            return true;
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) return false;
            throw e;
        }
    }

    async addEntrant(entrant: TournamentEntrant): Promise<void> {
        try {
            await this.client.send(
                new PutCommand({
                    TableName: TABLE,
                    Item: {
                        PK: tournPK(entrant.tournId),
                        SK: tournEntrantSK(entrant.userId),
                        // user-side GSI1 for "my tournaments"
                        GSI1PK: userPK(entrant.userId),
                        GSI1SK: tournUserGSI1SK(entrant.registeredAt),
                        ...entrant,
                    },
                    ConditionExpression: "attribute_not_exists(SK)",
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw Errors.Conflict("already registered");
            }
            throw e;
        }
    }

    async removeEntrant(tournId: string, userId: string): Promise<void> {
        try {
            await this.client.send(
                new DeleteCommand({
                    TableName: TABLE,
                    Key: {
                        PK: tournPK(tournId),
                        SK: tournEntrantSK(userId),
                    },
                    ConditionExpression: "attribute_exists(SK)",
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw Errors.NotFound("entrant");
            }
            throw e;
        }
    }

    async listEntrants(tournId: string): Promise<TournamentEntrant[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": tournPK(tournId),
                    ":sk": "ENTRANT#",
                },
            }),
        );
        return (r.Items as TournamentEntrant[] | undefined) ?? [];
    }

    async setEntrantSeed(
        tournId: string,
        userId: string,
        seedRank: number | null,
    ): Promise<void> {
        await this.client.send(
            new UpdateCommand({
                TableName: TABLE,
                Key: {
                    PK: tournPK(tournId),
                    SK: tournEntrantSK(userId),
                },
                UpdateExpression: "SET seedRank = :s",
                ExpressionAttributeValues: { ":s": seedRank },
            }),
        );
    }

    async markEliminated(
        tournId: string,
        userId: string,
        when: string,
    ): Promise<void> {
        await this.client.send(
            new UpdateCommand({
                TableName: TABLE,
                Key: {
                    PK: tournPK(tournId),
                    SK: tournEntrantSK(userId),
                },
                UpdateExpression: "SET eliminatedAt = :w",
                ExpressionAttributeValues: { ":w": when },
            }),
        );
    }
}

export const tournaments = new TournamentRepo();
