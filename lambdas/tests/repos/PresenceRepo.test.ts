import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    DeleteCommand,
    PutCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    PresenceRepo,
    PRESENCE_TTL_SECONDS,
} from "../../src/repos/PresenceRepo";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

describe("PresenceRepo", () => {
    test("put writes a row with TTL and conn-lookup GSI1", async () => {
        ddbMock.on(PutCommand).resolves({});
        const repo = new PresenceRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const before = Math.floor(Date.now() / 1000);
        await repo.put("u1", "c1");
        const item = ddbMock.commandCalls(PutCommand)[0]!.args[0].input.Item as
            Record<string, unknown>;
        expect(item.PK).toBe("PRESENCE#u1");
        expect(item.SK).toBe("CONN#c1");
        expect(item.GSI1PK).toBe("PRESENCE-CONN#c1");
        const ttl = item.ttl as number;
        expect(ttl).toBeGreaterThanOrEqual(before + PRESENCE_TTL_SECONDS - 1);
        expect(ttl).toBeLessThanOrEqual(before + PRESENCE_TTL_SECONDS + 2);
    });

    test("isOnline true when any connection row exists", async () => {
        ddbMock.on(QueryCommand).resolves({
            Items: [{ user_id: "u1", connection_id: "c1" }],
        });
        const repo = new PresenceRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        expect(await repo.isOnline("u1")).toBe(true);
    });

    test("isOnline false when no rows", async () => {
        ddbMock.on(QueryCommand).resolves({ Items: [] });
        const repo = new PresenceRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        expect(await repo.isOnline("u1")).toBe(false);
    });

    test("deleteByConnection finds via GSI1 and deletes", async () => {
        ddbMock.on(QueryCommand).resolves({
            Items: [
                {
                    PK: "PRESENCE#u1",
                    SK: "CONN#c1",
                    user_id: "u1",
                    connection_id: "c1",
                },
            ],
        });
        ddbMock.on(DeleteCommand).resolves({});
        const repo = new PresenceRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const userId = await repo.deleteByConnection("c1");
        expect(userId).toBe("u1");
        const del = ddbMock.commandCalls(DeleteCommand)[0]!.args[0].input.Key;
        expect(del).toEqual({ PK: "PRESENCE#u1", SK: "CONN#c1" });
    });
});
