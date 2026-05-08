import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { FeedRepo } from "../../src/repos/FeedRepo";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

describe("FeedRepo.append", () => {
    test("writes a row with reverse-ts SK and required fields", async () => {
        ddbMock.on(PutCommand).resolves({});
        const repo = new FeedRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await repo.append("u1", "raced", { room_id: "r1" });
        const item = ddbMock.commandCalls(PutCommand)[0]!.args[0].input.Item as
            Record<string, unknown>;
        expect(item.PK).toBe("FEED#u1");
        expect(String(item.SK).startsWith("EV#")).toBe(true);
        expect(item.type).toBe("raced");
        expect(item.user_id).toBe("u1");
        expect(typeof item.event_id).toBe("string");
        expect((item.payload as { room_id: string }).room_id).toBe("r1");
    });

    test("never throws on DDB error (best-effort write)", async () => {
        ddbMock.on(PutCommand).rejects(new Error("boom"));
        const repo = new FeedRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await repo.append("u1", "raced", {});
        // success = no throw
    });
});

describe("FeedRepo.list", () => {
    test("queries with begins_with(EV#) and respects Limit", async () => {
        ddbMock.on(QueryCommand).resolves({
            Items: [
                {
                    user_id: "u1",
                    event_id: "e1",
                    type: "raced",
                    payload: {},
                    created_at: "2026-05-08T00:00:00.000Z",
                },
            ],
        });
        const repo = new FeedRepo(ddbMock as unknown as DynamoDBDocumentClient);
        const events = await repo.list("u1", 10);
        expect(events).toHaveLength(1);
        const input = ddbMock.commandCalls(QueryCommand)[0]!.args[0].input;
        expect(input.Limit).toBe(10);
        expect(input.ExpressionAttributeValues![":pk"]).toBe("FEED#u1");
        expect(input.ExpressionAttributeValues![":sk"]).toBe("EV#");
    });
});
