import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
    TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
    tournMatchSK,
    tournMatchStatusGSI1PK,
    tournMatchStatusGSI1SK,
    tournPK,
} from "@codetype/shared/ddb-keys";
import type {
    MatchStatus,
    TournamentMatch,
} from "@codetype/shared/tournaments";
import { ddb, TABLE } from "../ddb";
import { Errors } from "../AppError";

export class MatchRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) {}

    async put(match: TournamentMatch): Promise<void> {
        await this.client.send(
            new PutCommand({
                TableName: TABLE,
                Item: this.toItem(match),
            }),
        );
    }

    async putIfAbsent(match: TournamentMatch): Promise<void> {
        try {
            await this.client.send(
                new PutCommand({
                    TableName: TABLE,
                    Item: this.toItem(match),
                    ConditionExpression: "attribute_not_exists(SK)",
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw Errors.Conflict(
                    `match ${match.round}#${match.slot} exists`,
                );
            }
            throw e;
        }
    }

    private toItem(m: TournamentMatch): Record<string, unknown> {
        return {
            PK: tournPK(m.tournId),
            SK: tournMatchSK(m.round, m.slot),
            GSI1PK: tournMatchStatusGSI1PK(m.tournId, m.status),
            GSI1SK: tournMatchStatusGSI1SK(m.round, m.slot),
            ...m,
        };
    }

    async get(
        tournId: string,
        round: number,
        slot: number,
    ): Promise<TournamentMatch | null> {
        const r = await this.client.send(
            new GetCommand({
                TableName: TABLE,
                Key: {
                    PK: tournPK(tournId),
                    SK: tournMatchSK(round, slot),
                },
            }),
        );
        return (r.Item as TournamentMatch | undefined) ?? null;
    }

    async listAll(tournId: string): Promise<TournamentMatch[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": tournPK(tournId),
                    ":sk": "MATCH#",
                },
            }),
        );
        return (r.Items as TournamentMatch[] | undefined) ?? [];
    }

    async listByStatus(
        tournId: string,
        status: MatchStatus,
    ): Promise<TournamentMatch[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                IndexName: "GSI1",
                KeyConditionExpression: "GSI1PK = :pk",
                ExpressionAttributeValues: {
                    ":pk": tournMatchStatusGSI1PK(tournId, status),
                },
            }),
        );
        return (r.Items as TournamentMatch[] | undefined) ?? [];
    }

    /**
     * CAS transition for match status. Used by the orchestrator so that two
     * simultaneous "race finished" stream events cannot both advance the
     * bracket — second writer fails cleanly.
     */
    async transitionStatus(
        tournId: string,
        round: number,
        slot: number,
        from: MatchStatus,
        to: MatchStatus,
        extra: Record<string, unknown> = {},
    ): Promise<boolean> {
        const sets = ["#s = :to", "GSI1PK = :gsi"];
        const values: Record<string, unknown> = {
            ":from": from,
            ":to": to,
            ":gsi": tournMatchStatusGSI1PK(tournId, to),
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
                    Key: {
                        PK: tournPK(tournId),
                        SK: tournMatchSK(round, slot),
                    },
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

    /**
     * Place a winner into a parent match's player slot atomically.
     * Conditional on parent slot being null and child match being `live`.
     * Single TransactWriteItems keeps bracket+match consistent.
     */
    async advanceWinner(args: {
        tournId: string;
        childRound: number;
        childSlot: number;
        winnerId: string;
        parentRound: number;
        parentSlot: number;
        parentSlotIndex: 0 | 1;
        completedAt: string;
    }): Promise<boolean> {
        const playerAttr = args.parentSlotIndex === 0
            ? "players[0]"
            : "players[1]";
        try {
            await this.client.send(
                new TransactWriteCommand({
                    TransactItems: [
                        {
                            Update: {
                                TableName: TABLE,
                                Key: {
                                    PK: tournPK(args.tournId),
                                    SK: tournMatchSK(
                                        args.childRound,
                                        args.childSlot,
                                    ),
                                },
                                UpdateExpression:
                                    "SET #s = :done, GSI1PK = :gsi, winnerId = :w, completedAt = :c",
                                ConditionExpression:
                                    "#s = :live AND winnerId = :w",
                                ExpressionAttributeNames: { "#s": "status" },
                                ExpressionAttributeValues: {
                                    ":done": "done",
                                    ":live": "live",
                                    ":w": args.winnerId,
                                    ":c": args.completedAt,
                                    ":gsi": tournMatchStatusGSI1PK(
                                        args.tournId,
                                        "done",
                                    ),
                                },
                            },
                        },
                        {
                            Update: {
                                TableName: TABLE,
                                Key: {
                                    PK: tournPK(args.tournId),
                                    SK: tournMatchSK(
                                        args.parentRound,
                                        args.parentSlot,
                                    ),
                                },
                                UpdateExpression: `SET ${playerAttr} = :w`,
                                ConditionExpression: `attribute_not_exists(${playerAttr}) OR ${playerAttr} = :null`,
                                ExpressionAttributeValues: {
                                    ":w": args.winnerId,
                                    ":null": null,
                                },
                            },
                        },
                    ],
                }),
            );
            return true;
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) return false;
            // TransactionCanceledException also surfaces conditional failures
            if ((e as { name?: string }).name === "TransactionCanceledException") {
                return false;
            }
            throw e;
        }
    }
}

export const matches = new MatchRepo();
