import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
    TransactWriteCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { QuestsRepo } from "../../src/repos/QuestsRepo";
import { ALL_QUEST_DEFS } from "@codetype/shared/progression/quests";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

const def = ALL_QUEST_DEFS.daily_3_races!;

describe("QuestsRepo.seedRotation", () => {
    test("writes one row per def, idempotent on conflict", async () => {
        let calls = 0;
        ddbMock.on(PutCommand).callsFake(async () => {
            calls++;
            if (calls === 2) {
                throw Object.assign(new Error("dup"), {
                    name: "ConditionalCheckFailedException",
                });
            }
            return {};
        });
        const repo = new QuestsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const r = await repo.seedRotation("daily", "2026-05-08", [
            def,
            def,
            def,
        ]);
        expect(r.written).toBe(2);
    });
});

describe("QuestsRepo.addProgress", () => {
    test("returns null when capped", async () => {
        ddbMock.on(UpdateCommand).rejects(
            Object.assign(new Error("at cap"), {
                name: "ConditionalCheckFailedException",
            }),
        );
        const repo = new QuestsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const r = await repo.addProgress("u1", "2026-05-08", def, 1);
        expect(r).toBeNull();
    });

    test("returns progress + completed flag", async () => {
        ddbMock.on(UpdateCommand).resolves({
            Attributes: { progress: 3, target: 3 },
        });
        const repo = new QuestsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const r = await repo.addProgress("u1", "2026-05-08", def, 1);
        expect(r).toEqual({ progress: 3, completed: true });
    });
});

describe("QuestsRepo.claim", () => {
    test("returns true on transaction success", async () => {
        ddbMock.on(TransactWriteCommand).resolves({});
        const repo = new QuestsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const ok = await repo.claim("u1", "2026-05-08", def);
        expect(ok).toBe(true);
    });

    test("returns false on TransactionCanceledException (already claimed)", async () => {
        ddbMock.on(TransactWriteCommand).rejects(
            Object.assign(new Error("cancel"), {
                name: "TransactionCanceledException",
            }),
        );
        const repo = new QuestsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const ok = await repo.claim("u1", "2026-05-08", def);
        expect(ok).toBe(false);
    });
});

describe("QuestsRepo.listActive / getProgressMap", () => {
    test("listActive returns mapped rows", async () => {
        ddbMock.on(QueryCommand).resolves({
            Items: [
                { quest_id: "daily_3_races", target: 3, xp: 30 },
            ],
        });
        const repo = new QuestsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const out = await repo.listActive("daily", "2026-05-08");
        expect(out).toEqual([
            { quest_id: "daily_3_races", target: 3, xp: 30 },
        ]);
    });

    test("getProgressMap keys by quest_id", async () => {
        ddbMock.on(QueryCommand).resolves({
            Items: [
                {
                    rotation_id: "2026-05-08",
                    quest_id: "daily_3_races",
                    progress: 2,
                    target: 3,
                    claimed: false,
                },
            ],
        });
        const repo = new QuestsRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const m = await repo.getProgressMap("u1", "2026-05-08");
        expect(m.get("daily_3_races")?.progress).toBe(2);
    });
});
