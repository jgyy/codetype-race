import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
    BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { AchievementsRepo } from "../../src/repos/AchievementsRepo";
import type { AchievementDef } from "@codetype/shared/progression/achievements";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

const def: AchievementDef = {
    id: "wpm_60",
    title: "Touch Typist",
    description: "60 wpm",
    category: "speed",
    tier: "bronze",
    hidden: false,
    xp: 5,
    unlisted: false,
};

describe("AchievementsRepo.tryUnlock", () => {
    test("returns true on first put, sets GSI keys for listed defs", async () => {
        ddbMock.on(PutCommand).resolves({});
        const repo = new AchievementsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const wrote = await repo.tryUnlock(
            "u1",
            def,
            "2026-05-08T12:00:00.000Z",
        );
        expect(wrote).toBe(true);
        const item = ddbMock.commandCalls(PutCommand)[0]!.args[0].input.Item as
            Record<string, unknown>;
        expect(item.PK).toBe("USER#u1");
        expect(item.SK).toBe("ACH#wpm_60");
        expect(item.GSI1PK).toBe("ACH#wpm_60");
        expect(item.xp_awarded).toBe(5);
    });

    test("returns false when ConditionalCheckFailedException", async () => {
        ddbMock.on(PutCommand).rejects(
            Object.assign(new Error("dup"), {
                name: "ConditionalCheckFailedException",
            }),
        );
        const repo = new AchievementsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const wrote = await repo.tryUnlock("u1", def, "2026-05-08T12:00:00Z");
        expect(wrote).toBe(false);
    });

    test("unlisted def omits GSI keys (hot-partition guard)", async () => {
        ddbMock.on(PutCommand).resolves({});
        const repo = new AchievementsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        await repo.tryUnlock(
            "u1",
            { ...def, unlisted: true },
            "2026-05-08T12:00:00Z",
        );
        const item = ddbMock.commandCalls(PutCommand)[0]!.args[0].input.Item as
            Record<string, unknown>;
        expect(item.GSI1PK).toBeUndefined();
    });
});

describe("AchievementsRepo.listForUser / listPinned / setPinned", () => {
    test("listForUser maps rows", async () => {
        ddbMock.on(QueryCommand).resolves({
            Items: [
                {
                    achievement_id: "wpm_60",
                    unlocked_at: "2026-05-08T12:00:00Z",
                    xp_awarded: 5,
                },
            ],
        });
        const repo = new AchievementsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const out = await repo.listForUser("u1");
        expect(out).toHaveLength(1);
        expect(out[0]!.achievement_id).toBe("wpm_60");
    });

    test("setPinned deletes existing pins then writes new ones via BatchWrite", async () => {
        ddbMock.on(QueryCommand).resolves({
            Items: [
                { SK: "ACHPIN#00", achievement_id: "old1" },
                { SK: "ACHPIN#01", achievement_id: "old2" },
            ],
        });
        ddbMock.on(BatchWriteCommand).resolves({});
        const repo = new AchievementsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        await repo.setPinned("u1", ["wpm_60", "first_race"]);
        const calls = ddbMock.commandCalls(BatchWriteCommand);
        expect(calls.length).toBeGreaterThanOrEqual(1);
        const reqs = calls[0]!.args[0].input.RequestItems!;
        const tableKey = Object.keys(reqs)[0]!;
        const writes = reqs[tableKey]!;
        const deletes = writes.filter((w: any) => w.DeleteRequest);
        const puts = writes.filter((w: any) => w.PutRequest);
        expect(deletes.length).toBe(2);
        expect(puts.length).toBe(2);
    });
});
