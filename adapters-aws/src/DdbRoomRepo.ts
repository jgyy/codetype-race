import {
    type DynamoDBDocumentClient,
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
import {
    DomainError,
    type RecordFinishInput,
    type Room,
    type RoomRepo,
    type RoomSnapshot,
    type RoomStatus,
    type SeedPlayer,
} from "@codetype/domain";

export interface DdbRoomRepoConfig {
    table: string;
    client: DynamoDBDocumentClient;
}

/**
 * Phase-13 slice-13.3 surface: only the methods CreateRoom + GetRoom
 * use. Other room access patterns continue through the legacy
 * lambdas/src/repos/RoomRepo until their handlers are migrated.
 *
 * The persisted shape is identical to the legacy repo so behavior is
 * fully compatible — this is a structural refactor only.
 */
export class DdbRoomRepo implements RoomRepo {
    constructor(private readonly cfg: DdbRoomRepoConfig) { }

    async save(room: Room, seedPlayers: SeedPlayer[]): Promise<void> {
        const snap = room.toSnapshot();
        try {
            await this.cfg.client.send(
                new PutCommand({
                    TableName: this.cfg.table,
                    Item: {
                        PK: roomPK(snap.room_id),
                        SK: roomMetaSK(),
                        GSI1PK: codeGSI1PK(snap.code),
                        GSI1SK: roomPK(snap.room_id),
                        ...snap,
                    },
                    ConditionExpression: "attribute_not_exists(PK)",
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw new DomainError("room.exists", 409, "room already exists");
            }
            throw e;
        }
        for (const p of seedPlayers) {
            try {
                await this.cfg.client.send(
                    new PutCommand({
                        TableName: this.cfg.table,
                        Item: {
                            PK: roomPK(snap.room_id),
                            SK: playerSK(p.display_name),
                            ...p,
                        },
                        ConditionExpression: "attribute_not_exists(SK)",
                    }),
                );
            } catch (e) {
                if (e instanceof ConditionalCheckFailedException) {
                    throw new DomainError(
                        "player.display_name_taken",
                        409,
                        "display_name taken",
                    );
                }
                throw e;
            }
        }
    }

    async isCodeTaken(code: string): Promise<boolean> {
        const r = await this.cfg.client.send(
            new QueryCommand({
                TableName: this.cfg.table,
                IndexName: "GSI1",
                KeyConditionExpression: "GSI1PK = :pk",
                ExpressionAttributeValues: { ":pk": codeGSI1PK(code) },
                Limit: 1,
            }),
        );
        return (r.Items?.length ?? 0) > 0;
    }

    async getById(roomId: string): Promise<RoomSnapshot | null> {
        const r = await this.cfg.client.send(
            new GetCommand({
                TableName: this.cfg.table,
                Key: { PK: roomPK(roomId), SK: roomMetaSK() },
            }),
        );
        return (r.Item as RoomSnapshot | undefined) ?? null;
    }

    async getByCode(code: string): Promise<RoomSnapshot | null> {
        const r = await this.cfg.client.send(
            new QueryCommand({
                TableName: this.cfg.table,
                IndexName: "GSI1",
                KeyConditionExpression: "GSI1PK = :pk",
                ExpressionAttributeValues: { ":pk": codeGSI1PK(code) },
                Limit: 1,
            }),
        );
        return (r.Items?.[0] as RoomSnapshot | undefined) ?? null;
    }

    async listPlayers(roomId: string): Promise<SeedPlayer[]> {
        const r = await this.cfg.client.send(
            new QueryCommand({
                TableName: this.cfg.table,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": roomPK(roomId),
                    ":sk": "PLAYER#",
                },
            }),
        );
        return (r.Items as SeedPlayer[] | undefined) ?? [];
    }

    async startCountdown(roomId: string, startedAt: number): Promise<void> {
        try {
            await this.cfg.client.send(
                new UpdateCommand({
                    TableName: this.cfg.table,
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
                throw new DomainError("room.already_started", 409);
            }
            throw e;
        }
    }

    async markPlayerDnf(roomId: string, displayName: string): Promise<void> {
        try {
            await this.cfg.client.send(
                new UpdateCommand({
                    TableName: this.cfg.table,
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
            await this.cfg.client.send(
                new UpdateCommand({
                    TableName: this.cfg.table,
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
        await this.cfg.client.send(
            new PutCommand({
                TableName: this.cfg.table,
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
