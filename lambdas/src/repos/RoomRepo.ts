import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
    codeGSI1PK,
    finishedGSI1SK,
    hostGSI1PK,
    playerSK,
    resultSK,
    roomMetaSK,
    roomPK,
} from "@codetype/shared/ddb-keys";
import { queryGsiThenHydrate } from "./queryGsiThenHydrate";
import type {
    Player,
    Room,
    RoomStatus,
} from "@codetype/shared/schemas";
import { ddb, TABLE } from "../ddb";
import { Errors } from "../AppError";

export interface RecordFinishInput {
    roomId: string;
    hostId: string;
    displayName: string;
    finishedAt: number;
    charsTyped: number;
    errors: number;
    grossWpm: number;
    netWpm: number;
    accuracy: number;
    scaledWpm: number;
    flagged?: boolean;
    flags?: Array<{ code: string; severity: string; detail: string }>;
}

export class RoomRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) { }

    async create(room: Room, seedPlayers: Player[] = []): Promise<void> {
        try {
            await this.client.send(
                new PutCommand({
                    TableName: TABLE,
                    Item: {
                        PK: roomPK(room.room_id),
                        SK: roomMetaSK(),
                        GSI1PK: codeGSI1PK(room.code),
                        GSI1SK: roomPK(room.room_id),
                        ...room,
                    },
                    ConditionExpression: "attribute_not_exists(PK)",
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw Errors.Conflict("room already exists");
            }
            throw e;
        }
        for (const p of seedPlayers) {
            await this.addPlayer(room.room_id, p);
        }
    }

    async recordReplay(roomId: string, replayKey: string): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: roomPK(roomId), SK: roomMetaSK() },
        UpdateExpression: "SET replay_key = :k",
        ExpressionAttributeValues: { ":k": replayKey },
      }),
    );
  }

  async listPlayers(roomId: string): Promise<Player[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": roomPK(roomId),
                    ":sk": "PLAYER#",
                },
            }),
        );
        return (r.Items as Player[] | undefined) ?? [];
    }

    async getMeta(roomId: string): Promise<Room | null> {
        const r = await this.client.send(
            new GetCommand({
                TableName: TABLE,
                Key: { PK: roomPK(roomId), SK: roomMetaSK() },
            }),
        );
        return (r.Item as Room | undefined) ?? null;
    }

    async getByCode(code: string): Promise<Room | null> {
        const items = await queryGsiThenHydrate<Room>(this.client, TABLE, {
            TableName: TABLE,
            IndexName: "GSI1",
            KeyConditionExpression: "GSI1PK = :pk",
            ExpressionAttributeValues: { ":pk": codeGSI1PK(code) },
            Limit: 1,
        });
        return items[0] ?? null;
    }

    async isCodeTaken(code: string): Promise<boolean> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                IndexName: "GSI1",
                KeyConditionExpression: "GSI1PK = :pk",
                ExpressionAttributeValues: { ":pk": codeGSI1PK(code) },
                Limit: 1,
            }),
        );
        return (r.Items?.length ?? 0) > 0;
    }

    async countPlayers(roomId: string): Promise<number> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": roomPK(roomId),
                    ":sk": "PLAYER#",
                },
                Select: "COUNT",
            }),
        );
        return r.Count ?? 0;
    }

    async addPlayer(roomId: string, player: Player): Promise<void> {
        try {
            await this.client.send(
                new PutCommand({
                    TableName: TABLE,
                    Item: {
                        PK: roomPK(roomId),
                        SK: playerSK(player.display_name),
                        ...player,
                    },
                    ConditionExpression: "attribute_not_exists(SK)",
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw Errors.Conflict("display_name taken");
            }
            throw e;
        }
    }

    async markPlayerDnf(roomId: string, displayName: string): Promise<void> {
        try {
            await this.client.send(
                new UpdateCommand({
                    TableName: TABLE,
                    Key: { PK: roomPK(roomId), SK: playerSK(displayName) },
                    UpdateExpression: "SET is_dnf = :t",
                    ConditionExpression:
                        "attribute_exists(SK) AND attribute_not_exists(finished_at)",
                    ExpressionAttributeValues: { ":t": true },
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) return;
            throw e;
        }
    }

    async updateProgress(
        roomId: string,
        displayName: string,
        progress: number,
        charsTyped: number,
        errors: number,
    ): Promise<void> {
        await this.client.send(
            new UpdateCommand({
                TableName: TABLE,
                Key: { PK: roomPK(roomId), SK: playerSK(displayName) },
                UpdateExpression:
                    "SET progress = :p, chars_typed = :c, errors = :e",
                ExpressionAttributeValues: {
                    ":p": progress,
                    ":c": charsTyped,
                    ":e": errors,
                },
            }),
        );
    }

    async startCountdown(roomId: string, startedAt: number): Promise<void> {
        try {
            await this.client.send(
                new UpdateCommand({
                    TableName: TABLE,
                    Key: { PK: roomPK(roomId), SK: roomMetaSK() },
                    UpdateExpression:
                        "SET #s = :countdown, started_at = :ts, version = version + :one",
                    ConditionExpression: "#s = :lobby",
                    ExpressionAttributeNames: { "#s": "status" },
                    ExpressionAttributeValues: {
                        ":countdown": "countdown" satisfies RoomStatus,
                        ":lobby": "lobby" satisfies RoomStatus,
                        ":ts": startedAt,
                        ":one": 1,
                    },
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw Errors.Conflict("already started");
            }
            throw e;
        }
    }

    async recordFinish(input: RecordFinishInput): Promise<void> {
        const {
            roomId,
            hostId,
            displayName,
            finishedAt,
            charsTyped,
            errors,
            grossWpm,
            netWpm,
            accuracy,
            scaledWpm,
            flagged,
            flags,
        } = input;

        try {
            await this.client.send(
                new UpdateCommand({
                    TableName: TABLE,
                    Key: { PK: roomPK(roomId), SK: playerSK(displayName) },
                    UpdateExpression:
                        "SET finished_at = :f, gross_wpm = :g, net_wpm = :n, accuracy = :a, scaled_wpm = :s, progress = :p",
                    ConditionExpression: "attribute_not_exists(finished_at)",
                    ExpressionAttributeValues: {
                        ":f": finishedAt,
                        ":g": grossWpm,
                        ":n": netWpm,
                        ":a": accuracy,
                        ":s": scaledWpm,
                        ":p": 1,
                    },
                }),
            );
        } catch (e) {
            if (!(e instanceof ConditionalCheckFailedException)) throw e;
        }

        await this.client.send(
            new PutCommand({
                TableName: TABLE,
                Item: {
                    PK: roomPK(roomId),
                    SK: resultSK(finishedAt, displayName),
                    GSI1PK: hostGSI1PK(hostId),
                    GSI1SK: finishedGSI1SK(finishedAt),
                    room_id: roomId,
                    display_name: displayName,
                    finished_at: finishedAt,
                    gross_wpm: grossWpm,
                    net_wpm: netWpm,
                    accuracy,
                    scaled_wpm: scaledWpm,
                    chars_typed: charsTyped,
                    errors,
                    ...(flagged ? { flagged: true, flags: flags ?? [] } : {}),
                },
            }),
        );
    }
}

export const rooms = new RoomRepo();
