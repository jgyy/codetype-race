import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
    TransactWriteCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { canKick, GuildRepo } from "../../src/repos/GuildRepo";
import type { Guild } from "@codetype/shared/social";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

const GID = "11111111-1111-4111-8111-111111111111";
const OWNER = "owner-1";

const guildFixture = (over: Partial<Guild> = {}): Guild => ({
    id: GID,
    name: "Coders",
    slug: "coders",
    visibility: "public",
    ownerId: OWNER,
    description: "",
    memberCount: 1,
    createdAt: "2026-05-08T00:00:00.000Z",
    ...over,
});

describe("GuildRepo.create", () => {
    test("writes slug sentinel + guild + owner member transactionally", async () => {
        ddbMock.on(TransactWriteCommand).resolves({});
        const repo = new GuildRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await repo.create(guildFixture());
        const items = ddbMock
            .commandCalls(TransactWriteCommand)[0]!.args[0].input
            .TransactItems!;
        expect(items).toHaveLength(3);
        expect(items[0]!.Put!.Item!.PK).toBe("GUILD#SLUG#coders");
        expect(items[0]!.Put!.ConditionExpression).toContain(
            "attribute_not_exists",
        );
        expect(items[1]!.Put!.Item!.SK).toBe("META");
        expect(items[1]!.Put!.Item!.GSI1PK).toBe("GUILD#PUBLIC#cod");
        expect(items[2]!.Put!.Item!.SK).toBe(`MEMBER#${OWNER}`);
        expect(items[2]!.Put!.Item!.role).toBe("owner");
    });

    test("private guild has no GSI1 entry on the meta row", async () => {
        ddbMock.on(TransactWriteCommand).resolves({});
        const repo = new GuildRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await repo.create(guildFixture({ visibility: "private" }));
        const item = ddbMock
            .commandCalls(TransactWriteCommand)[0]!.args[0].input
            .TransactItems![1]!.Put!.Item as Record<string, unknown>;
        expect(item.GSI1PK).toBeUndefined();
        expect(item.GSI1SK).toBeUndefined();
    });

    test("slug collision surfaces as 409 CONFLICT", async () => {
        ddbMock
            .on(TransactWriteCommand)
            .rejects(
                new TransactionCanceledException({
                    $metadata: {},
                    message: "x",
                    CancellationReasons: [],
                }),
            );
        const repo = new GuildRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await expect(repo.create(guildFixture())).rejects.toMatchObject({
            code: "CONFLICT",
        });
    });
});

describe("GuildRepo.addMember", () => {
    test("conditional ADD enforces 50-member cap", async () => {
        ddbMock.on(TransactWriteCommand).resolves({});
        const repo = new GuildRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await repo.addMember(GID, "u2", "member", "2026-05-08T00:00:01.000Z");
        const items = ddbMock
            .commandCalls(TransactWriteCommand)[0]!.args[0].input
            .TransactItems!;
        expect(items[0]!.Put!.ConditionExpression).toContain(
            "attribute_not_exists",
        );
        const counter = items[1]!.Update!;
        expect(counter.ConditionExpression).toContain("memberCount < :max");
        expect(counter.UpdateExpression).toContain("ADD memberCount :one");
    });

    test("cap-violation maps to CONFLICT", async () => {
        ddbMock
            .on(TransactWriteCommand)
            .rejects(
                new TransactionCanceledException({
                    $metadata: {},
                    message: "x",
                    CancellationReasons: [],
                }),
            );
        const repo = new GuildRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await expect(
            repo.addMember(GID, "u2", "member", "2026-05-08T00:00:01.000Z"),
        ).rejects.toMatchObject({ code: "CONFLICT" });
    });
});

describe("GuildRepo.removeMember", () => {
    test("refuses to remove the owner", async () => {
        ddbMock.on(GetCommand).resolves({
            Item: {
                guildId: GID,
                userId: OWNER,
                role: "owner",
                joinedAt: "2026-05-08T00:00:00.000Z",
            },
        });
        const repo = new GuildRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await expect(repo.removeMember(GID, OWNER)).rejects.toMatchObject({
            code: "CONFLICT",
        });
    });

    test("decrements memberCount atomically with delete", async () => {
        ddbMock.on(GetCommand).resolves({
            Item: {
                guildId: GID,
                userId: "u2",
                role: "member",
                joinedAt: "2026-05-08T00:00:00.000Z",
            },
        });
        ddbMock.on(TransactWriteCommand).resolves({});
        const repo = new GuildRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await repo.removeMember(GID, "u2");
        const items = ddbMock
            .commandCalls(TransactWriteCommand)[0]!.args[0].input
            .TransactItems!;
        expect(items[0]!.Delete).toBeDefined();
        expect(items[1]!.Update!.UpdateExpression).toContain(
            "ADD memberCount :neg",
        );
    });
});

describe("GuildRepo.transferOwnership", () => {
    test("swaps roles and updates Guild.ownerId in one transaction", async () => {
        ddbMock.on(TransactWriteCommand).resolves({});
        const repo = new GuildRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await repo.transferOwnership(GID, OWNER, "u2");
        const items = ddbMock
            .commandCalls(TransactWriteCommand)[0]!.args[0].input
            .TransactItems!;
        expect(items).toHaveLength(3);
        expect(items[0]!.Update!.ExpressionAttributeValues![":mod"]).toBe("mod");
        expect(items[1]!.Update!.ExpressionAttributeValues![":owner"]).toBe(
            "owner",
        );
        expect(items[2]!.Update!.UpdateExpression).toContain("SET ownerId");
    });

    test("no-op when ids are equal", async () => {
        const repo = new GuildRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await repo.transferOwnership(GID, OWNER, OWNER);
        expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
    });
});

describe("canKick role hierarchy", () => {
    test("owner can kick mod and member", () => {
        expect(canKick("owner", "mod")).toBe(true);
        expect(canKick("owner", "member")).toBe(true);
    });
    test("mod can kick member but not mod or owner", () => {
        expect(canKick("mod", "member")).toBe(true);
        expect(canKick("mod", "mod")).toBe(false);
        expect(canKick("mod", "owner")).toBe(false);
    });
    test("member cannot kick anyone", () => {
        expect(canKick("member", "member")).toBe(false);
        expect(canKick("member", "mod")).toBe(false);
        expect(canKick("member", "owner")).toBe(false);
    });
});

describe("GuildRepo.findInviteByCode", () => {
    test("returns null when no row found", async () => {
        ddbMock.on(QueryCommand).resolves({ Items: [] });
        const repo = new GuildRepo(ddbMock as unknown as DynamoDBDocumentClient);
        expect(await repo.findInviteByCode("XYZ")).toBeNull();
    });

    test("returns null when expired", async () => {
        ddbMock.on(QueryCommand).resolves({
            Items: [
                {
                    PK: "GUILD#g",
                    SK: "INVITE#XYZ",
                    guildId: "g",
                    code: "XYZ",
                    expiresAt: "2020-01-01T00:00:00.000Z",
                },
            ],
        });
        const repo = new GuildRepo(ddbMock as unknown as DynamoDBDocumentClient);
        expect(await repo.findInviteByCode("XYZ")).toBeNull();
    });

    test("returns row when valid", async () => {
        const future = new Date(Date.now() + 60_000).toISOString();
        ddbMock.on(QueryCommand).resolves({
            Items: [
                {
                    PK: "GUILD#g",
                    SK: "INVITE#XYZ",
                    guildId: "g",
                    code: "XYZ",
                    expiresAt: future,
                },
            ],
        });
        const repo = new GuildRepo(ddbMock as unknown as DynamoDBDocumentClient);
        const row = await repo.findInviteByCode("XYZ");
        expect(row?.guildId).toBe("g");
    });
});
