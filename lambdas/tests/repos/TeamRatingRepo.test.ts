import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { TeamRatingRepo } from "../../src/repos/TeamRatingRepo";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

describe("TeamRatingRepo.buildApplyItems", () => {
    test("emits idempotency flag + delete+put per player", () => {
        const repo = new TeamRatingRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const items = repo.buildApplyItems("room-1", [
            {
                userId: "u1",
                displayName: "alice",
                language: "ts",
                delta: 12,
                oldRating: 1000,
            },
            {
                userId: "u2",
                displayName: "bob",
                language: "ts",
                delta: -12,
                oldRating: 1000,
            },
        ]);
        // 1 idempotency + 2 players * (delete + put)
        expect(items).toHaveLength(1 + 4);
        expect(items[0].Update.ConditionExpression).toContain(
            "attribute_not_exists(team_elo_applied)",
        );
        // Deletes target the OLD inverted-rating SK; Puts target the new.
        expect(items[1].Delete).toBeDefined();
        expect(items[2].Put.Item.rating).toBe(1012);
        expect(items[3].Delete).toBeDefined();
        expect(items[4].Put.Item.rating).toBe(988);
    });

    test("returns only idempotency item when applies is empty", () => {
        const repo = new TeamRatingRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const items = repo.buildApplyItems("room-1", []);
        expect(items).toHaveLength(1);
    });
});

describe("TeamRatingRepo.sendTransaction", () => {
    test("no-op on empty items", async () => {
        const repo = new TeamRatingRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        await repo.sendTransaction([]);
        expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
    });

    test("forwards items to TransactWrite", async () => {
        ddbMock.on(TransactWriteCommand).resolves({});
        const repo = new TeamRatingRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        await repo.sendTransaction([{ Put: { TableName: "x", Item: {} } } as any]);
        expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(1);
    });
});
