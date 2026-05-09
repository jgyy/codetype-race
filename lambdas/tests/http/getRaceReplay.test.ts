import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = "test-table";
});
afterEach(() => ddbMock.reset());

const RID = "11111111-1111-4111-8111-111111111111";
const CORR = "22222222-2222-4222-8222-222222222222";

function eventItem(seq: number, type: string, payload: Record<string, unknown> = {}) {
    return {
        PK: `RACE#${RID}`,
        SK: `EV#${String(seq).padStart(10, "0")}`,
        raceId: RID,
        seq,
        type,
        occurredAt: "2026-05-09T00:00:00.000Z",
        actorId: null,
        payload,
        commandId: null,
        causationId: null,
        correlationId: CORR,
    };
}

function event(pathId: string): any {
    return {
        body: undefined,
        routeKey: "GET /races/{id}/replay",
        pathParameters: { id: pathId },
        queryStringParameters: {},
        requestContext: {
            requestId: "req-1",
            http: { method: "GET", path: `/races/${pathId}/replay` },
        },
    };
}

describe("GET /races/{id}/replay", () => {
    test("returns source='digest' with lifecycle events + digest when CURSOR_DIGEST exists", async () => {
        ddbMock.on(QueryCommand).resolves({
            Items: [
                eventItem(0, "RACE_CREATED"),
                eventItem(1, "RACE_STARTED"),
                eventItem(2, "CURSOR_PROGRESS", { userId: "u1", charsTyped: 3, accuracy: 1 }),
                eventItem(3, "CURSOR_PROGRESS", { userId: "u1", charsTyped: 9, accuracy: 1 }),
                eventItem(4, "RACE_FINISHED"),
                eventItem(5, "CURSOR_DIGEST", {
                    raceId: RID,
                    startedAt: "2026-05-09T00:00:00.000Z",
                    finishedAt: "2026-05-09T00:00:30.000Z",
                    bucketMs: 200,
                    perPlayer: { u1: [{ t: 0, charsTyped: 9, accuracy: 1 }] },
                }),
            ],
        });
        const { handler } = await import("../../http/getRaceReplay");
        const res = (await handler(event(RID))) as any;
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.source).toBe("digest");
        expect(body.events.map((e: any) => e.type)).toEqual([
            "RACE_CREATED",
            "RACE_STARTED",
            "RACE_FINISHED",
        ]);
        expect(body.digest.type).toBe("CURSOR_DIGEST");
        expect(body.cursorEvents).toBeUndefined();
    });

    test("returns source='raw' with lifecycle + cursor events when no digest yet", async () => {
        ddbMock.on(QueryCommand).resolves({
            Items: [
                eventItem(0, "RACE_CREATED"),
                eventItem(1, "RACE_STARTED"),
                eventItem(2, "CURSOR_PROGRESS", { userId: "u1", charsTyped: 3, accuracy: 1 }),
                eventItem(3, "RACE_FINISHED"),
            ],
        });
        const { handler } = await import("../../http/getRaceReplay");
        const res = (await handler(event(RID))) as any;
        const body = JSON.parse(res.body);
        expect(body.source).toBe("raw");
        expect(body.events).toHaveLength(3); // CREATED, STARTED, FINISHED
        expect(body.cursorEvents).toHaveLength(1);
        expect(body.digest).toBeUndefined();
    });

    test("404 when no events exist for the race", async () => {
        ddbMock.on(QueryCommand).resolves({ Items: [] });
        const { handler } = await import("../../http/getRaceReplay");
        const res = (await handler(event(RID))) as any;
        expect(res.statusCode).toBe(404);
    });

    test("400 on non-UUID race id", async () => {
        const { handler } = await import("../../http/getRaceReplay");
        const res = (await handler(event("not-a-uuid"))) as any;
        expect(res.statusCode).toBe(400);
    });
});
