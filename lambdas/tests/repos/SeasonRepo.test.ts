import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { SeasonRepo } from "../../src/repos/SeasonRepo";
import { AppError } from "../../src/AppError";
import type { Season } from "@codetype/shared/tournaments";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

const sample: Season = {
    id: "2026-S2",
    status: "active",
    startsAt: "2026-04-01T00:00:00.000Z",
    endsAt: "2026-06-30T00:00:00.000Z",
    decayFactor: 0.25,
    decayTarget: 1200,
};

describe("SeasonRepo", () => {
    test("create stores meta with GSI1 status partition", async () => {
        ddbMock.on(PutCommand).resolves({});
        const repo = new SeasonRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await repo.create(sample);
        const calls = ddbMock.commandCalls(PutCommand);
        expect(calls).toHaveLength(1);
        const item = calls[0]!.args[0].input.Item as Record<string, unknown>;
        expect(item.PK).toBe("SEASON#2026-S2");
        expect(item.SK).toBe("META");
        expect(item.GSI1PK).toBe("SEASON#STATUS#active");
        expect(item.GSI1SK).toBe(sample.startsAt);
    });

    test("create maps ConditionalCheckFailed to Conflict", async () => {
        ddbMock.on(PutCommand).rejects(
            new ConditionalCheckFailedException({ $metadata: {}, message: "exists" }),
        );
        const repo = new SeasonRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await expect(repo.create(sample)).rejects.toBeInstanceOf(AppError);
    });

    test("transitionStatus returns false when CAS fails", async () => {
        ddbMock.on(UpdateCommand).rejects(
            new ConditionalCheckFailedException({ $metadata: {}, message: "x" }),
        );
        const repo = new SeasonRepo(ddbMock as unknown as DynamoDBDocumentClient);
        const ok = await repo.transitionStatus("2026-S2", "active", "finalizing");
        expect(ok).toBe(false);
    });

    test("frozen leaderboard rows reject overwrite (acceptance criterion)", async () => {
        ddbMock.on(PutCommand).rejects(
            new ConditionalCheckFailedException({ $metadata: {}, message: "exists" }),
        );
        const repo = new SeasonRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await expect(
            repo.putLeaderboardRow({
                seasonId: "2026-S1",
                language: "ts",
                rank: 1,
                userId: "u",
                displayName: "u",
                rating: 2400,
                racesPlayed: 50,
            }),
        ).rejects.toBeInstanceOf(AppError);
    });

    test("listByStatus queries GSI1", async () => {
        ddbMock.on(QueryCommand).resolves({ Items: [sample] });
        const repo = new SeasonRepo(ddbMock as unknown as DynamoDBDocumentClient);
        const got = await repo.listByStatus("active");
        expect(got).toHaveLength(1);
        const call = ddbMock.commandCalls(QueryCommand)[0]!;
        expect(call.args[0].input.IndexName).toBe("GSI1");
    });
});
