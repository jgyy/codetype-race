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
});
afterEach(() => ddbMock.reset());

function event(opts: {
    body?: unknown;
    pathParameters?: Record<string, string>;
    queryStringParameters?: Record<string, string>;
    userId?: string;
    groups?: string[];
}) {
    const claims: Record<string, unknown> = {};
    if (opts.userId) claims.sub = opts.userId;
    if (opts.groups) claims["cognito:groups"] = opts.groups;
    return {
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        routeKey: "POST /test",
        pathParameters: opts.pathParameters,
        queryStringParameters: opts.queryStringParameters,
        requestContext: {
            requestId: "req-1",
            http: { method: "POST", path: "/test" },
            authorizer: opts.userId ? { jwt: { claims } } : undefined,
        },
    } as unknown as Parameters<
        Awaited<ReturnType<typeof import("../../http/tournaments/create").handler>>["constructor"]
    >[0];
}

describe("POST /tournaments — create", () => {
    test("rejects when feature flag is off", async () => {
        process.env.ENABLE_TOURNAMENTS = "false";
        const { handler } = await import("../../http/tournaments/create");
        const res = await handler(
            event({
                userId: "u-1",
                groups: ["mod"],
                body: {
                    name: "Friday Night",
                    size: 8,
                    startsAt: "2026-05-09T12:00:00.000Z",
                    registrationClosesAt: "2026-05-09T11:55:00.000Z",
                    seasonId: "2026-S2",
                },
            }) as never,
        );
        expect((res as { statusCode: number }).statusCode).toBe(503);
    });

    test("rejects non-mod users", async () => {
        const { handler } = await import("../../http/tournaments/create");
        const res = await handler(
            event({
                userId: "u-1",
                groups: [],
                body: {
                    name: "Friday Night",
                    size: 8,
                    startsAt: "2026-05-09T12:00:00.000Z",
                    registrationClosesAt: "2026-05-09T11:55:00.000Z",
                    seasonId: "2026-S2",
                },
            }) as never,
        );
        expect((res as { statusCode: number }).statusCode).toBe(403);
    });

    test("rejects when registrationClosesAt is after startsAt", async () => {
        ddbMock.on(PutCommand).resolves({});
        const { handler } = await import("../../http/tournaments/create");
        const res = await handler(
            event({
                userId: "u-1",
                groups: ["mod"],
                body: {
                    name: "Inverted",
                    size: 4,
                    startsAt: "2026-05-09T12:00:00.000Z",
                    registrationClosesAt: "2026-05-09T13:00:00.000Z",
                    seasonId: "2026-S2",
                },
            }) as never,
        );
        expect((res as { statusCode: number }).statusCode).toBe(400);
    });

    test("happy path returns 200 with new id", async () => {
        ddbMock.on(PutCommand).resolves({});
        const { handler } = await import("../../http/tournaments/create");
        const res = await handler(
            event({
                userId: "u-1",
                groups: ["mod"],
                body: {
                    name: "Happy Path",
                    size: 4,
                    startsAt: "2026-05-09T12:00:00.000Z",
                    registrationClosesAt: "2026-05-09T11:55:00.000Z",
                    seasonId: "2026-S2",
                },
            }) as never,
        );
        const out = res as { statusCode: number; body: string };
        expect(out.statusCode).toBe(200);
        const body = JSON.parse(out.body);
        expect(typeof body.id).toBe("string");
        expect(body.id.length).toBeGreaterThan(0);
    });
});

describe("POST /tournaments/:id/register", () => {
    test("rejects after registrationClosesAt", async () => {
        const past = new Date(Date.now() - 60_000).toISOString();
        ddbMock.on(GetCommand).resolves({
            Item: {
                id: "11111111-1111-4111-8111-111111111111",
                name: "x",
                size: 4,
                language: "*",
                difficulty: "any",
                status: "registering",
                startsAt: past,
                registrationClosesAt: past,
                seasonId: "2026-S2",
                hostId: "h",
                createdAt: past,
                winnerId: null,
            },
        });
        const { handler } = await import("../../http/tournaments/register");
        const res = await handler(
            event({
                userId: "u-1",
                groups: [],
                pathParameters: { id: "11111111-1111-4111-8111-111111111111" },
            }) as never,
        );
        expect((res as { statusCode: number }).statusCode).toBe(409);
    });

    test("rejects when tournament is full", async () => {
        const future = new Date(Date.now() + 60_000).toISOString();
        const id = "11111111-1111-4111-8111-111111111111";
        ddbMock.on(GetCommand).resolves({
            Item: {
                id,
                name: "x",
                size: 4,
                language: "*",
                difficulty: "any",
                status: "registering",
                startsAt: future,
                registrationClosesAt: future,
                seasonId: "2026-S2",
                hostId: "h",
                createdAt: future,
                winnerId: null,
            },
        });
        // listEntrants returns 4 items → full
        ddbMock.on(QueryCommand).resolves({
            Items: Array.from({ length: 4 }, (_, i) => ({
                tournId: id,
                userId: `u${i}`,
            })),
        });
        const { handler } = await import("../../http/tournaments/register");
        const res = await handler(
            event({
                userId: "u-new",
                groups: [],
                pathParameters: { id },
            }) as never,
        );
        expect((res as { statusCode: number }).statusCode).toBe(409);
    });
});
