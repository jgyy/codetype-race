import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
    TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { FriendsRepo } from "../../src/repos/FriendsRepo";
import { AppError } from "../../src/AppError";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

const A = "user-a";
const B = "user-b";

describe("FriendsRepo.sendRequest", () => {
    test("writes two edges + an inbox row in one transaction", async () => {
        ddbMock.on(TransactWriteCommand).resolves({});
        const repo = new FriendsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        await repo.sendRequest(A, B);
        const calls = ddbMock.commandCalls(TransactWriteCommand);
        expect(calls).toHaveLength(1);
        const items = calls[0]!.args[0].input.TransactItems!;
        expect(items).toHaveLength(3);
        const skAB = items[0]!.Put!.Item!.SK;
        const skBA = items[1]!.Put!.Item!.SK;
        expect(skAB).toBe(`FRIEND#${B}`);
        expect(skBA).toBe(`FRIEND#${A}`);
        expect(items[2]!.Put!.Item!.SK).toMatch(/^FREQ#user-a#/);
    });

    test("rejects self-friending", async () => {
        const repo = new FriendsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        await expect(repo.sendRequest(A, A)).rejects.toBeInstanceOf(AppError);
    });

    test("conflict on cancelled transaction (existing block)", async () => {
        ddbMock.on(TransactWriteCommand).rejects(
            new TransactionCanceledException({
                $metadata: {},
                message: "blocked",
                CancellationReasons: [],
            }),
        );
        const repo = new FriendsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        await expect(repo.sendRequest(A, B)).rejects.toMatchObject({
            code: "CONFLICT",
        });
    });
});

describe("FriendsRepo.accept", () => {
    test("idempotent on already-accepted", async () => {
        ddbMock.on(GetCommand).resolves({
            Item: {
                PK: `USER#${A}`,
                SK: `FRIEND#${B}`,
                fromUserId: B,
                toUserId: A,
                status: "accepted",
                createdAt: "2026-05-08T00:00:00.000Z",
            },
        });
        const repo = new FriendsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        await repo.accept(A, B); // should not throw
        expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
    });

    test("forbidden when blocked", async () => {
        ddbMock.on(GetCommand).resolves({
            Item: {
                PK: `USER#${A}`,
                SK: `FRIEND#${B}`,
                fromUserId: B,
                toUserId: A,
                status: "blocked",
                createdAt: "2026-05-08T00:00:00.000Z",
            },
        });
        const repo = new FriendsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        await expect(repo.accept(A, B)).rejects.toMatchObject({
            code: "FORBIDDEN",
        });
    });

    test("transitions both edges and deletes inbox row", async () => {
        ddbMock.on(GetCommand).resolves({
            Item: {
                PK: `USER#${A}`,
                SK: `FRIEND#${B}`,
                fromUserId: B,
                toUserId: A,
                status: "pending",
                createdAt: "2026-05-08T00:00:00.000Z",
            },
        });
        ddbMock.on(QueryCommand).resolves({
            Items: [
                {
                    PK: `USER#${A}`,
                    SK: `FREQ#${B}#2026-05-08T00:00:00.000Z`,
                    fromUserId: B,
                    toUserId: A,
                    createdAt: "2026-05-08T00:00:00.000Z",
                },
            ],
        });
        ddbMock.on(TransactWriteCommand).resolves({});
        const repo = new FriendsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        await repo.accept(A, B);
        const items = ddbMock.commandCalls(TransactWriteCommand)[0]!.args[0]
            .input.TransactItems!;
        expect(items).toHaveLength(3);
        expect(items[0]!.Update).toBeDefined();
        expect(items[1]!.Update).toBeDefined();
        expect(items[2]!.Delete).toBeDefined();
    });
});

describe("FriendsRepo.block", () => {
    test("overwrites both edges to status=blocked", async () => {
        ddbMock.on(QueryCommand).resolves({ Items: [] });
        ddbMock.on(TransactWriteCommand).resolves({});
        const repo = new FriendsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        await repo.block(A, B);
        const items = ddbMock.commandCalls(TransactWriteCommand)[0]!.args[0]
            .input.TransactItems!;
        expect(items).toHaveLength(2);
        expect(items[0]!.Put!.Item!.status).toBe("blocked");
        expect(items[1]!.Put!.Item!.status).toBe("blocked");
    });
});
