import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    GetCommand,
} from "@aws-sdk/lib-dynamodb";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = "test-table";
});
afterEach(() => ddbMock.reset());

const RID = "11111111-1111-4111-8111-111111111111";

function event(pathId: string): any {
    return {
        body: undefined,
        routeKey: "GET /races/{id}",
        pathParameters: { id: pathId },
        queryStringParameters: {},
        requestContext: {
            requestId: "req-1",
            http: { method: "GET", path: `/races/${pathId}` },
        },
    };
}

describe("GET /races/{id}", () => {
    test("returns the projection state when present", async () => {
        ddbMock.on(GetCommand).resolves({
            Item: {
                PK: `RACE#${RID}`,
                SK: "PROJ#STATE",
                id: RID,
                status: "racing",
                players: { u1: { userId: "u1", displayName: "A", charsTyped: 10, errors: 0, accuracy: 1, wpm: 60, finishedAt: null, flags: [] } },
                countdownStartedAt: "2026-05-09T00:00:00.000Z",
                startedAt: "2026-05-09T00:00:03.000Z",
                finishedAt: null,
                lastSeq: 5,
            },
        });
        const { handler } = await import("../../http/getRace");
        const res = (await handler(event(RID))) as any;
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.id).toBe(RID);
        expect(body.status).toBe("racing");
        expect(body.lastSeq).toBe(5);
        expect(body.players.u1.charsTyped).toBe(10);
    });

    test("404 when no projection exists", async () => {
        ddbMock.on(GetCommand).resolves({});
        const { handler } = await import("../../http/getRace");
        const res = (await handler(event(RID))) as any;
        expect(res.statusCode).toBe(404);
        expect(JSON.parse(res.body).error.code).toBe("NOT_FOUND");
    });

    test("400 on non-UUID race id", async () => {
        const { handler } = await import("../../http/getRace");
        const res = (await handler(event("not-a-uuid"))) as any;
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error.message).toMatch(/invalid race id/);
    });
});
