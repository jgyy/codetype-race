import {
    DynamoDBDocumentClient,
    DeleteCommand,
    GetCommand,
    QueryCommand,
    TransactWriteCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    ConditionalCheckFailedException,
    TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import {
    guildInviteSK,
    guildMemberPrefix,
    guildMemberSK,
    guildMetaSK,
    guildPK,
    guildPublicGSI1PK,
    guildPublicGSI1SK,
    guildSlugPK,
    handleBucket,
    inviteCodeGSI1PK,
    inviteCodeGSI1SK,
    userGuildGSI1PK,
    userGuildGSI1SK,
} from "@codetype/shared/ddb-keys";
import {
    GUILD_MAX_MEMBERS,
    INVITE_TTL_SECONDS,
    type Guild,
    type GuildMember,
    type GuildRole,
    type GuildVisibility,
} from "@codetype/shared/social";
import { ddb, TABLE } from "../ddb";
import { Errors } from "../AppError";

interface GuildRow extends Guild {
    PK: string;
    SK: string;
    GSI1PK?: string;
    GSI1SK?: string;
}

interface GuildMemberRow extends GuildMember {
    PK: string;
    SK: string;
    GSI1PK: string;
    GSI1SK: string;
}

interface GuildInviteRow {
    PK: string;
    SK: string;
    GSI1PK: string;
    GSI1SK: string;
    guildId: string;
    code: string;
    createdBy: string;
    createdAt: string;
    expiresAt: string;
    ttl: number;
}

const ROLE_RANK: Record<GuildRole, number> = { owner: 3, mod: 2, member: 1 };

export function canKick(actor: GuildRole, target: GuildRole): boolean {
    return ROLE_RANK[actor] > ROLE_RANK[target];
}

export class GuildRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) { }

    async create(guild: Guild): Promise<void> {
        const slugLower = guild.slug.toLowerCase();
        const guildItem: GuildRow = {
            PK: guildPK(guild.id),
            SK: guildMetaSK(),
            ...guild,
        };
        if (guild.visibility === "public") {
            guildItem.GSI1PK = guildPublicGSI1PK(slugLower);
            guildItem.GSI1SK = guildPublicGSI1SK(slugLower, guild.id);
        }
        const ownerMember: GuildMemberRow = {
            PK: guildPK(guild.id),
            SK: guildMemberSK(guild.ownerId),
            GSI1PK: userGuildGSI1PK(guild.ownerId),
            GSI1SK: userGuildGSI1SK(guild.id, guild.createdAt),
            guildId: guild.id,
            userId: guild.ownerId,
            role: "owner",
            joinedAt: guild.createdAt,
        };
        try {
            await this.client.send(
                new TransactWriteCommand({
                    TransactItems: [
                        {
                            Put: {
                                TableName: TABLE,
                                Item: {
                                    PK: guildSlugPK(slugLower),
                                    SK: guildMetaSK(),
                                    guildId: guild.id,
                                },
                                ConditionExpression: "attribute_not_exists(PK)",
                            },
                        },
                        {
                            Put: {
                                TableName: TABLE,
                                Item: guildItem,
                                ConditionExpression: "attribute_not_exists(PK)",
                            },
                        },
                        {
                            Put: { TableName: TABLE, Item: ownerMember },
                        },
                    ],
                }),
            );
        } catch (e) {
            if (e instanceof TransactionCanceledException) {
                throw Errors.Conflict("slug already taken");
            }
            throw e;
        }
    }

    async get(guildId: string): Promise<Guild | null> {
        const r = await this.client.send(
            new GetCommand({
                TableName: TABLE,
                Key: { PK: guildPK(guildId), SK: guildMetaSK() },
            }),
        );
        return (r.Item as GuildRow | undefined) ?? null;
    }

    async listMembers(guildId: string): Promise<GuildMember[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": guildPK(guildId),
                    ":sk": guildMemberPrefix(),
                },
            }),
        );
        return (r.Items as GuildMemberRow[] | undefined) ?? [];
    }

    async getMember(
        guildId: string,
        userId: string,
    ): Promise<GuildMember | null> {
        const r = await this.client.send(
            new GetCommand({
                TableName: TABLE,
                Key: { PK: guildPK(guildId), SK: guildMemberSK(userId) },
            }),
        );
        return (r.Item as GuildMemberRow | undefined) ?? null;
    }

    /** Public-guild discovery; bucket-prefixed begins_with on GSI1SK. */
    async discoverPublic(slugPrefix: string, limit = 25): Promise<Guild[]> {
        const lower = slugPrefix.toLowerCase();
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                IndexName: "GSI1",
                KeyConditionExpression:
                    "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": `GUILD#PUBLIC#${handleBucket(lower)}`,
                    ":sk": lower,
                },
                Limit: limit,
            }),
        );
        return (r.Items as GuildRow[] | undefined) ?? [];
    }

    async addMember(
        guildId: string,
        userId: string,
        role: GuildRole,
        joinedAt: string,
    ): Promise<void> {
        const member: GuildMemberRow = {
            PK: guildPK(guildId),
            SK: guildMemberSK(userId),
            GSI1PK: userGuildGSI1PK(userId),
            GSI1SK: userGuildGSI1SK(guildId, joinedAt),
            guildId,
            userId,
            role,
            joinedAt,
        };
        try {
            await this.client.send(
                new TransactWriteCommand({
                    TransactItems: [
                        {
                            Put: {
                                TableName: TABLE,
                                Item: member,
                                ConditionExpression: "attribute_not_exists(PK)",
                            },
                        },
                        {
                            Update: {
                                TableName: TABLE,
                                Key: {
                                    PK: guildPK(guildId),
                                    SK: guildMetaSK(),
                                },
                                UpdateExpression:
                                    "ADD memberCount :one",
                                ConditionExpression:
                                    "memberCount < :max",
                                ExpressionAttributeValues: {
                                    ":one": 1,
                                    ":max": GUILD_MAX_MEMBERS,
                                },
                            },
                        },
                    ],
                }),
            );
        } catch (e) {
            if (e instanceof TransactionCanceledException) {
                throw Errors.Conflict("already a member or guild full");
            }
            throw e;
        }
    }

    /**
     * Remove a member. If they are the owner, the caller must transfer
     * ownership first; this method refuses to delete the last owner.
     */
    async removeMember(guildId: string, userId: string): Promise<void> {
        const member = await this.getMember(guildId, userId);
        if (!member) throw Errors.NotFound("member");
        if (member.role === "owner") {
            throw Errors.Conflict("transfer ownership before leaving");
        }
        await this.client.send(
            new TransactWriteCommand({
                TransactItems: [
                    {
                        Delete: {
                            TableName: TABLE,
                            Key: {
                                PK: guildPK(guildId),
                                SK: guildMemberSK(userId),
                            },
                        },
                    },
                    {
                        Update: {
                            TableName: TABLE,
                            Key: {
                                PK: guildPK(guildId),
                                SK: guildMetaSK(),
                            },
                            UpdateExpression: "ADD memberCount :neg",
                            ConditionExpression: "memberCount > :zero",
                            ExpressionAttributeValues: {
                                ":neg": -1,
                                ":zero": 0,
                            },
                        },
                    },
                ],
            }),
        );
    }

    async update(
        guildId: string,
        patch: {
            name?: string;
            description?: string;
            visibility?: GuildVisibility;
        },
        existing: Guild,
    ): Promise<Guild> {
        const sets: string[] = [];
        const removes: string[] = [];
        const values: Record<string, unknown> = {};
        const names: Record<string, string> = {};

        if (patch.name !== undefined) {
            sets.push("#n = :n");
            names["#n"] = "name";
            values[":n"] = patch.name;
        }
        if (patch.description !== undefined) {
            sets.push("description = :d");
            values[":d"] = patch.description;
        }
        const slugLower = existing.slug.toLowerCase();
        if (
            patch.visibility !== undefined &&
            patch.visibility !== existing.visibility
        ) {
            sets.push("visibility = :v");
            values[":v"] = patch.visibility;
            if (patch.visibility === "public") {
                sets.push("GSI1PK = :gpk", "GSI1SK = :gsk");
                values[":gpk"] = guildPublicGSI1PK(slugLower);
                values[":gsk"] = guildPublicGSI1SK(slugLower, guildId);
            } else {
                removes.push("GSI1PK", "GSI1SK");
            }
        }
        if (sets.length === 0 && removes.length === 0) return existing;
        let expr = `SET ${sets.join(", ")}`;
        if (removes.length > 0) expr += ` REMOVE ${removes.join(", ")}`;
        const r = await this.client.send(
            new UpdateCommand({
                TableName: TABLE,
                Key: { PK: guildPK(guildId), SK: guildMetaSK() },
                UpdateExpression: expr,
                ExpressionAttributeValues: values,
                ExpressionAttributeNames:
                    Object.keys(names).length > 0 ? names : undefined,
                ReturnValues: "ALL_NEW",
            }),
        );
        return r.Attributes as Guild;
    }

    /**
     * Atomically swap owner. Both rows transition: old owner → mod,
     * new owner → owner. If the new owner isn't already a member, this
     * fails because there is no member row to update.
     */
    async transferOwnership(
        guildId: string,
        currentOwnerId: string,
        newOwnerId: string,
    ): Promise<void> {
        if (currentOwnerId === newOwnerId) return;
        try {
            await this.client.send(
                new TransactWriteCommand({
                    TransactItems: [
                        {
                            Update: {
                                TableName: TABLE,
                                Key: {
                                    PK: guildPK(guildId),
                                    SK: guildMemberSK(currentOwnerId),
                                },
                                UpdateExpression: "SET #r = :mod",
                                ConditionExpression: "#r = :owner",
                                ExpressionAttributeNames: { "#r": "role" },
                                ExpressionAttributeValues: {
                                    ":mod": "mod",
                                    ":owner": "owner",
                                },
                            },
                        },
                        {
                            Update: {
                                TableName: TABLE,
                                Key: {
                                    PK: guildPK(guildId),
                                    SK: guildMemberSK(newOwnerId),
                                },
                                UpdateExpression: "SET #r = :owner",
                                ConditionExpression: "attribute_exists(PK)",
                                ExpressionAttributeNames: { "#r": "role" },
                                ExpressionAttributeValues: {
                                    ":owner": "owner",
                                },
                            },
                        },
                        {
                            Update: {
                                TableName: TABLE,
                                Key: {
                                    PK: guildPK(guildId),
                                    SK: guildMetaSK(),
                                },
                                UpdateExpression: "SET ownerId = :o",
                                ConditionExpression: "ownerId = :curr",
                                ExpressionAttributeValues: {
                                    ":o": newOwnerId,
                                    ":curr": currentOwnerId,
                                },
                            },
                        },
                    ],
                }),
            );
        } catch (e) {
            if (e instanceof TransactionCanceledException) {
                throw Errors.Conflict("ownership transfer failed");
            }
            throw e;
        }
    }

    async createInvite(
        guildId: string,
        code: string,
        createdBy: string,
    ): Promise<{ code: string; expiresAt: string }> {
        const now = Date.now();
        const expiresAtMs = now + INVITE_TTL_SECONDS * 1000;
        const item: GuildInviteRow = {
            PK: guildPK(guildId),
            SK: guildInviteSK(code),
            GSI1PK: inviteCodeGSI1PK(code),
            GSI1SK: inviteCodeGSI1SK(guildId),
            guildId,
            code,
            createdBy,
            createdAt: new Date(now).toISOString(),
            expiresAt: new Date(expiresAtMs).toISOString(),
            ttl: Math.floor(expiresAtMs / 1000),
        };
        try {
            await this.client.send(
                new TransactWriteCommand({
                    TransactItems: [
                        {
                            Put: {
                                TableName: TABLE,
                                Item: item,
                                ConditionExpression: "attribute_not_exists(PK)",
                            },
                        },
                    ],
                }),
            );
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) {
                throw Errors.Conflict("invite code collision");
            }
            throw e;
        }
        return { code, expiresAt: item.expiresAt };
    }

    async findInviteByCode(code: string): Promise<GuildInviteRow | null> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                IndexName: "GSI1",
                KeyConditionExpression: "GSI1PK = :pk",
                ExpressionAttributeValues: {
                    ":pk": inviteCodeGSI1PK(code),
                },
                Limit: 1,
            }),
        );
        const row = r.Items?.[0] as GuildInviteRow | undefined;
        if (!row) return null;
        if (Date.parse(row.expiresAt) < Date.now()) return null;
        return row;
    }

    async deleteInvite(guildId: string, code: string): Promise<void> {
        await this.client.send(
            new DeleteCommand({
                TableName: TABLE,
                Key: { PK: guildPK(guildId), SK: guildInviteSK(code) },
            }),
        );
    }
}

export const guilds = new GuildRepo();
