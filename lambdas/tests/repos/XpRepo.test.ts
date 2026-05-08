import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { XpRepo } from "../../src/repos/XpRepo";
import type { EventEnvelope } from "@codetype/shared/eventlog";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

const sampleEnv: EventEnvelope = {
    id: "11111111-1111-4111-8111-111111111111",
    type: "RACE_FINISHED",
    occurredAt: "2026-05-08T12:00:00.000Z",
    userId: "u1",
    payload: { roomId: "r1", displayName: "alice", finishedAt: 1 },
    source: "stream",
    v: 1,
};

describe("XpRepo.award", () => {
    test("writes ledger row and bumps summary on first award", async () => {
        ddbMock.on(PutCommand).resolves({});
        ddbMock
            .on(UpdateCommand)
            .resolvesOnce({ Attributes: { totalXp: 10 } })
            .resolves({ Attributes: { totalXp: 30, lastRaceDate: "2026-05-08" } });

        const repo = new XpRepo(ddbMock as unknown as DynamoDBDocumentClient);
        const r = await repo.award(sampleEnv, 10, {
            bonusOnFirstRaceOfDay: true,
        });

        expect(r.delta).toBe(10);
        expect(r.bonusDelta).toBe(20);
        expect(r.summary.totalXp).toBe(30);
        expect(r.summary.lastRaceDate).toBe("2026-05-08");

        const puts = ddbMock.commandCalls(PutCommand);
        expect(puts.length).toBe(2);
        const ledgerItem = puts[0]!.args[0].input.Item as Record<string, unknown>;
        expect(ledgerItem.PK).toBe("XP#u1");
        expect(String(ledgerItem.SK).startsWith("EV#")).toBe(true);
        expect(ledgerItem.delta).toBe(10);
    });

    test("dedupes when ledger conditional fails (idempotent retry)", async () => {
        const condFail = Object.assign(new Error("dup"), {
            name: "ConditionalCheckFailedException",
        });
        ddbMock.on(PutCommand).rejects(condFail);
        ddbMock.on(GetCommand).resolves({
            Item: { totalXp: 100, lastRaceDate: "2026-05-08" },
        });
        const repo = new XpRepo(ddbMock as unknown as DynamoDBDocumentClient);
        const r = await repo.award(sampleEnv, 10, {
            bonusOnFirstRaceOfDay: true,
        });
        expect(r.deduped).toBe(true);
        expect(r.delta).toBe(0);
        expect(r.bonusDelta).toBe(0);
        expect(r.summary.totalXp).toBe(100);
        expect(ddbMock.commandCalls(UpdateCommand).length).toBe(0);
    });

    test("skips bonus when bonus ledger conditional fails (already awarded today)", async () => {
        let putCount = 0;
        ddbMock.on(PutCommand).callsFake(async () => {
            putCount++;
            if (putCount === 2) {
                throw Object.assign(new Error("dup"), {
                    name: "ConditionalCheckFailedException",
                });
            }
            return {};
        });
        ddbMock
            .on(UpdateCommand)
            .resolvesOnce({ Attributes: { totalXp: 10 } })
            .resolves({
                Attributes: { totalXp: 10, lastRaceDate: "2026-05-08" },
            });

        const repo = new XpRepo(ddbMock as unknown as DynamoDBDocumentClient);
        const r = await repo.award(sampleEnv, 10, {
            bonusOnFirstRaceOfDay: true,
        });
        expect(r.delta).toBe(10);
        expect(r.bonusDelta).toBe(0);
    });

    test("non-race events skip bonus path entirely", async () => {
        ddbMock.on(PutCommand).resolves({});
        ddbMock.on(UpdateCommand).resolves({
            Attributes: { totalXp: 30 },
        });
        const repo = new XpRepo(ddbMock as unknown as DynamoDBDocumentClient);
        const r = await repo.award(
            { ...sampleEnv, type: "DAILY_DONE" },
            30,
            {},
        );
        expect(r.bonusDelta).toBe(0);
        expect(ddbMock.commandCalls(UpdateCommand).length).toBe(1);
    });
});

describe("XpRepo.getSummary", () => {
    test("returns null when row missing", async () => {
        ddbMock.on(GetCommand).resolves({});
        const repo = new XpRepo(ddbMock as unknown as DynamoDBDocumentClient);
        expect(await repo.getSummary("u1")).toBeNull();
    });

    test("derives level from totalXp", async () => {
        ddbMock.on(GetCommand).resolves({
            Item: { totalXp: 250, lastRaceDate: "2026-05-08" },
        });
        const repo = new XpRepo(ddbMock as unknown as DynamoDBDocumentClient);
        const s = (await repo.getSummary("u1"))!;
        expect(s.totalXp).toBe(250);
        expect(s.level).toBeGreaterThanOrEqual(2);
        expect(s.lastRaceDate).toBe("2026-05-08");
    });
});
