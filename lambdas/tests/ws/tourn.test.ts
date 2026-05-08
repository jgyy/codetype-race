import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = "test-table";
    process.env.ENABLE_TOURNAMENTS = "true";
    delete process.env.WS_ENDPOINT; // BRACKET_INIT post is best-effort
});
afterEach(() => ddbMock.reset());

const TID = "11111111-1111-4111-8111-111111111111";

function wsEvent(opts: {
    queryStringParameters?: Record<string, string>;
    routeKey?: string;
    connectionId?: string;
}) {
    return {
        body: undefined,
        queryStringParameters: opts.queryStringParameters,
        requestContext: {
            requestId: "req-ws",
            connectionId: opts.connectionId ?? "conn-1",
            routeKey: opts.routeKey ?? "$connect",
        },
    } as never;
}

describe("/tourn $connect", () => {
    test("rejects unknown tournament", async () => {
        ddbMock.on(GetCommand).resolves({}); // tournament not found
        const { handler } = await import("../../ws/tourn/connect");
        const res = await handler(
            wsEvent({
                queryStringParameters: { tournId: TID },
            }),
        );
        expect((res as { statusCode: number }).statusCode).toBe(404);
    });

    test("rejects when feature flag is off", async () => {
        process.env.ENABLE_TOURNAMENTS = "false";
        const { handler } = await import("../../ws/tourn/connect");
        const res = await handler(
            wsEvent({
                queryStringParameters: { tournId: TID },
            }),
        );
        expect((res as { statusCode: number }).statusCode).toBe(503);
    });

    test("rejects malformed query (zod 400)", async () => {
        const { handler } = await import("../../ws/tourn/connect");
        const res = await handler(
            wsEvent({ queryStringParameters: { tournId: "not-a-uuid" } }),
        );
        expect((res as { statusCode: number }).statusCode).toBe(400);
    });

    test("happy path stores conn row + sends BRACKET_INIT (post is no-op)", async () => {
        ddbMock.on(GetCommand).resolves({
            Item: {
                id: TID,
                name: "Live",
                size: 4,
                language: "*",
                difficulty: "any",
                status: "running",
                startsAt: "2026-05-09T12:00:00.000Z",
                registrationClosesAt: "2026-05-09T11:55:00.000Z",
                seasonId: "2026-S2",
                hostId: "h",
                createdAt: "2026-05-08T00:00:00.000Z",
                winnerId: null,
            },
        });
        // listAll matches: empty list is fine
        ddbMock.on(QueryCommand).resolves({ Items: [] });
        ddbMock.on(PutCommand).resolves({});

        const { handler } = await import("../../ws/tourn/connect");
        const res = await handler(
            wsEvent({
                queryStringParameters: { tournId: TID, userId: "u-1" },
                connectionId: "conn-42",
            }),
        );
        expect((res as { statusCode: number }).statusCode).toBe(200);
        const puts = ddbMock.commandCalls(PutCommand);
        expect(puts.length).toBeGreaterThan(0);
        const item = puts[0]!.args[0].input.Item as Record<string, unknown>;
        expect(item.PK).toBe(`TOURN#${TID}`);
        expect(item.SK).toBe("CONN#conn-42");
        expect(item.GSI1PK).toBe("CONN#conn-42");
        expect(item.GSI1SK).toBe(`TOURN#${TID}`);
        expect(item.user_id).toBe("u-1");
    });
});
