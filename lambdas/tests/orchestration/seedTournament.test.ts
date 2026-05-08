import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { seedTournament } from "../../src/orchestration/seedTournament";
import { MatchRepo } from "../../src/repos/MatchRepo";
import { TournamentRepo } from "../../src/repos/TournamentRepo";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = "test-table";
});
afterEach(() => ddbMock.reset());

const TID = "11111111-1111-4111-8111-111111111111";

describe("seedTournament — integration via real repos + mocked DDB", () => {
    test("size 4 with 4 entrants: 2 first-round matches, no byes, seedRanks persisted", async () => {
        // listEntrants
        ddbMock.on(QueryCommand).resolves({
            Items: [
                {
                    tournId: TID,
                    userId: "alice",
                    snapshotRating: 2400,
                    displayName: "alice",
                    seedRank: null,
                    registeredAt: "2026-05-08T00:00:00.000Z",
                    eliminatedAt: null,
                    dq: false,
                },
                {
                    tournId: TID,
                    userId: "bob",
                    snapshotRating: 1900,
                    displayName: "bob",
                    seedRank: null,
                    registeredAt: "2026-05-08T00:00:00.000Z",
                    eliminatedAt: null,
                    dq: false,
                },
                {
                    tournId: TID,
                    userId: "carol",
                    snapshotRating: 1700,
                    displayName: "carol",
                    seedRank: null,
                    registeredAt: "2026-05-08T00:00:00.000Z",
                    eliminatedAt: null,
                    dq: false,
                },
                {
                    tournId: TID,
                    userId: "dan",
                    snapshotRating: 1500,
                    displayName: "dan",
                    seedRank: null,
                    registeredAt: "2026-05-08T00:00:00.000Z",
                    eliminatedAt: null,
                    dq: false,
                },
            ],
        });
        ddbMock.on(PutCommand).resolves({});
        ddbMock.on(UpdateCommand).resolves({});

        const written = await seedTournament({
            tournId: TID,
            size: 4,
            startsAt: "2026-05-09T12:00:00.000Z",
            matches: new MatchRepo(
                ddbMock as unknown as DynamoDBDocumentClient,
            ),
            tournaments: new TournamentRepo(
                ddbMock as unknown as DynamoDBDocumentClient,
            ),
        });

        expect(written).toHaveLength(2);
        expect(written.every((m) => m.round === 1)).toBe(true);
        // Seed-1 (alice) must face seed-4 (dan); seed-2 (bob) faces seed-3 (carol).
        const pairs = written.map((m) =>
            [m.players[0], m.players[1]].join("v"),
        );
        expect(pairs).toEqual(["alicevdan", "bobvcarol"]);
        expect(written.every((m) => m.status === "pending")).toBe(true);

        // setEntrantSeed called once per filled slot (4 entrants * 1).
        const updates = ddbMock.commandCalls(UpdateCommand);
        expect(updates.length).toBe(4);
    });

    test("size 8 with 5 entrants: 3 byes auto-resolved with status=bye + winnerId set", async () => {
        ddbMock.on(QueryCommand).resolves({
            Items: [
                { userId: "p1", snapshotRating: 2200 },
                { userId: "p2", snapshotRating: 2000 },
                { userId: "p3", snapshotRating: 1800 },
                { userId: "p4", snapshotRating: 1500 },
                { userId: "p5", snapshotRating: 1200 },
            ].map((p) => ({
                tournId: TID,
                userId: p.userId,
                displayName: p.userId,
                snapshotRating: p.snapshotRating,
                seedRank: null,
                registeredAt: "2026-05-08T00:00:00.000Z",
                eliminatedAt: null,
                dq: false,
            })),
        });
        ddbMock.on(PutCommand).resolves({});
        ddbMock.on(UpdateCommand).resolves({});

        const written = await seedTournament({
            tournId: TID,
            size: 8,
            startsAt: "2026-05-09T12:00:00.000Z",
            matches: new MatchRepo(
                ddbMock as unknown as DynamoDBDocumentClient,
            ),
            tournaments: new TournamentRepo(
                ddbMock as unknown as DynamoDBDocumentClient,
            ),
        });

        expect(written).toHaveLength(4);
        const byes = written.filter((m) => m.status === "bye");
        expect(byes).toHaveLength(3);
        // Byes have winnerId pointing at the present player and completedAt set.
        for (const b of byes) {
            expect(b.winnerId).not.toBeNull();
            expect(b.completedAt).not.toBeNull();
        }
        // The lone real match has status=pending, no winner yet.
        const real = written.filter((m) => m.status !== "bye");
        expect(real).toHaveLength(1);
        expect(real[0]!.winnerId).toBeNull();
    });
});
