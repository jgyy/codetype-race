import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    DeleteCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { TournamentRepo } from "../../src/repos/TournamentRepo";
import { AppError } from "../../src/AppError";
import type {
    Tournament,
    TournamentEntrant,
} from "@codetype/shared/tournaments";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

const sample: Tournament = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Friday 8pm",
    size: 8,
    language: "*",
    difficulty: "any",
    status: "registering",
    startsAt: "2026-05-09T12:00:00.000Z",
    registrationClosesAt: "2026-05-09T11:55:00.000Z",
    seasonId: "2026-S2",
    hostId: "host-1",
    createdAt: "2026-05-08T00:00:00.000Z",
    winnerId: null,
};

describe("TournamentRepo", () => {
    test("create writes meta with GSI1 status partition", async () => {
        ddbMock.on(PutCommand).resolves({});
        const repo = new TournamentRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        await repo.create(sample);
        const item = ddbMock.commandCalls(PutCommand)[0]!.args[0].input.Item as
            Record<string, unknown>;
        expect(item.PK).toBe(`TOURN#${sample.id}`);
        expect(item.SK).toBe("META");
        expect(item.GSI1PK).toBe("TOURN#STATUS#registering");
    });

    test("addEntrant uses USER# GSI1 for 'my tournaments'", async () => {
        ddbMock.on(PutCommand).resolves({});
        const repo = new TournamentRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const entrant: TournamentEntrant = {
            tournId: sample.id,
            userId: "u-9",
            displayName: "Niner",
            seedRank: null,
            snapshotRating: 1500,
            registeredAt: "2026-05-08T01:00:00.000Z",
            eliminatedAt: null,
            dq: false,
        };
        await repo.addEntrant(entrant);
        const item = ddbMock.commandCalls(PutCommand)[0]!.args[0].input.Item as
            Record<string, unknown>;
        expect(item.GSI1PK).toBe("USER#u-9");
        expect(item.GSI1SK).toBe(`TOURN#${entrant.registeredAt}`);
    });

    test("addEntrant Conflict on duplicate registration", async () => {
        ddbMock.on(PutCommand).rejects(
            new ConditionalCheckFailedException({ $metadata: {}, message: "x" }),
        );
        const repo = new TournamentRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        await expect(
            repo.addEntrant({
                tournId: sample.id,
                userId: "u",
                displayName: "u",
                seedRank: null,
                snapshotRating: 1500,
                registeredAt: "2026-05-08T01:00:00.000Z",
                eliminatedAt: null,
                dq: false,
            }),
        ).rejects.toBeInstanceOf(AppError);
    });

    test("removeEntrant NotFound when entrant missing", async () => {
        ddbMock.on(DeleteCommand).rejects(
            new ConditionalCheckFailedException({ $metadata: {}, message: "x" }),
        );
        const repo = new TournamentRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        await expect(repo.removeEntrant(sample.id, "u")).rejects
            .toBeInstanceOf(AppError);
    });

    test("listEntrants queries with begins_with ENTRANT#", async () => {
        ddbMock.on(QueryCommand).resolves({ Items: [] });
        const repo = new TournamentRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        await repo.listEntrants(sample.id);
        const input = ddbMock.commandCalls(QueryCommand)[0]!.args[0].input;
        expect(input.KeyConditionExpression).toContain("begins_with");
        expect(input.ExpressionAttributeValues![":sk"]).toBe("ENTRANT#");
    });

    test("transitionStatus applies extra fields and CAS", async () => {
        ddbMock.on(UpdateCommand).resolves({});
        const repo = new TournamentRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const ok = await repo.transitionStatus(
            sample.id,
            "running",
            "finished",
            { winnerId: "u-1" },
        );
        expect(ok).toBe(true);
        const input = ddbMock.commandCalls(UpdateCommand)[0]!.args[0].input;
        expect(input.ConditionExpression).toBe("#s = :from");
        expect(input.ExpressionAttributeNames).toMatchObject({
            "#x0": "winnerId",
        });
        expect(input.ExpressionAttributeValues![":x0"]).toBe("u-1");
    });
});
