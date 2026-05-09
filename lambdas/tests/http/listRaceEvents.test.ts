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

function eventItem(seq: number, type: string) {
    return {
        PK: `RACE#${RID}`,
        SK: `EV#${String(seq).padStart(10, "0")}`,
        raceId: RID,
        seq,
        type,
        occurredAt: "2026-05-09T00:00:00.000Z",
        actorId: null,
        payload: {},
        commandId: null,
        causationId: null,
        correlationId: CORR,
    };
}

function event(pathId: string, qs: Record<string, string> = {}): any {
    return {
        body: undefined,
        routeKey: "GET /races/{id}/events",
        pathParameters: { id: pathId },
        queryStringParameters: qs,
        requestContext: {
            requestId: "req-1",
            http: { method: "GET", path: `/races/${pathId}/events` },
        },
    };
}

describe("GET /races/{id}/events", () => {
    test("returns events with default pagination (no since, default limit)", async () => {
        ddbMock.on(QueryCommand).resolves({
            Items: [eventItem(0, "RACE_CREATED"), eventItem(1, "PLAYER_JOINED")],
        });
        const { handler } = await import("../../http/listRaceEvents");
        const res = (await handler(event(RID))) as any;
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.events).toHaveLength(2);
        expect(body.events[0].seq).toBe(0);
        expect(body.hasMore).toBe(false);
        expect(body.nextCursor).toBeNull();
    });

    test("respects ?since cursor — query SK > sinceSeq", async () => {
        ddbMock.on(QueryCommand).resolves({
            Items: [eventItem(6, "CURSOR_PROGRESS")],
        });
        const { handler } = await import("../../http/listRaceEvents");
        const res = (await handler(event(RID, { since: "5" }))) as any;
        expect(res.statusCode).toBe(200);
        const calls = ddbMock.commandCalls(QueryCommand);
        const lastCall = calls[calls.length - 1];
        expect(lastCall.args[0].input.ExpressionAttributeValues![":sk"]).toBe(
            "EV#0000000005",
        );
    });

    test("returns nextCursor + hasMore when result fills the limit", async () => {
        const items = Array.from({ length: 3 }, (_, i) =>
            eventItem(i, "CURSOR_PROGRESS"),
        );
        ddbMock.on(QueryCommand).resolves({ Items: items });
        const { handler } = await import("../../http/listRaceEvents");
        const res = (await handler(event(RID, { limit: "3" }))) as any;
        const body = JSON.parse(res.body);
        expect(body.events).toHaveLength(3);
        expect(body.hasMore).toBe(true);
        expect(body.nextCursor).toBe(2);
    });

    test("caps limit at MAX_LIMIT (1000)", async () => {
        ddbMock.on(QueryCommand).resolves({ Items: [] });
        const { handler } = await import("../../http/listRaceEvents");
        await handler(event(RID, { limit: "9999" }));
        const calls = ddbMock.commandCalls(QueryCommand);
        const lastCall = calls[calls.length - 1];
        expect(lastCall.args[0].input.Limit).toBe(1000);
    });

    test("400 on non-UUID race id", async () => {
        const { handler } = await import("../../http/listRaceEvents");
        const res = (await handler(event("not-a-uuid"))) as any;
        expect(res.statusCode).toBe(400);
    });

    test("400 on negative since", async () => {
        const { handler } = await import("../../http/listRaceEvents");
        const res = (await handler(event(RID, { since: "-5" }))) as any;
        expect(res.statusCode).toBe(400);
    });

    test("400 on non-integer limit", async () => {
        const { handler } = await import("../../http/listRaceEvents");
        const res = (await handler(event(RID, { limit: "0" }))) as any;
        expect(res.statusCode).toBe(400);
    });
});
