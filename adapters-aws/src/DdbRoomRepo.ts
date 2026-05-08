import {
    type DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
    codeGSI1PK,
    playerSK,
    roomMetaSK,
    roomPK,
} from "@codetype/shared/ddb-keys";
import {
    DomainError,
    type Room,
    type RoomRepo,
    type RoomSnapshot,
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
}
