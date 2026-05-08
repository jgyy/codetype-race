import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
    TransactWriteCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { MatchRepo } from "../../src/repos/MatchRepo";
import type { TournamentMatch } from "@codetype/shared/tournaments";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

const TID = "11111111-1111-4111-8111-111111111111";

const m = (over: Partial<TournamentMatch> = {}): TournamentMatch => ({
    tournId: TID,
    round: 1,
    slot: 0,
    status: "live",
    players: ["a", "b"],
    winnerId: null,
    roomId: "room-1",
    scheduledAt: "2026-05-09T12:00:00.000Z",
    completedAt: null,
    flagged: false,
    ...over,
});

describe("MatchRepo", () => {
    test("put encodes GSI1 status partition + sort", async () => {
        ddbMock.on(PutCommand).resolves({});
        const repo = new MatchRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await repo.put(m());
        const item = ddbMock.commandCalls(PutCommand)[0]!.args[0].input.Item as
            Record<string, unknown>;
        expect(item.PK).toBe(`TOURN#${TID}`);
        expect(item.SK).toBe("MATCH#1#0");
        expect(item.GSI1PK).toBe(`TOURN#${TID}#MATCH#STATUS#live`);
        expect(item.GSI1SK).toBe("1#0");
    });

    test("transitionStatus CAS failure returns false (concurrent finishers)", async () => {
        ddbMock.on(UpdateCommand).rejects(
            new ConditionalCheckFailedException({ $metadata: {}, message: "x" }),
        );
        const repo = new MatchRepo(ddbMock as unknown as DynamoDBDocumentClient);
        const ok = await repo.transitionStatus(TID, 1, 0, "live", "done");
        expect(ok).toBe(false);
    });

    test("advanceWinner returns false when transaction is cancelled", async () => {
        const err = new Error("Transaction cancelled");
        (err as { name: string }).name = "TransactionCanceledException";
        ddbMock.on(TransactWriteCommand).rejects(err);
        const repo = new MatchRepo(ddbMock as unknown as DynamoDBDocumentClient);
        const ok = await repo.advanceWinner({
            tournId: TID,
            childRound: 1,
            childSlot: 0,
            winnerId: "a",
            parentRound: 0,
            parentSlot: 0,
            parentSlotIndex: 0,
            completedAt: "2026-05-09T13:00:00.000Z",
        });
        expect(ok).toBe(false);
    });

    test("advanceWinner happy path issues a single TransactWrite", async () => {
        ddbMock.on(TransactWriteCommand).resolves({});
        const repo = new MatchRepo(ddbMock as unknown as DynamoDBDocumentClient);
        const ok = await repo.advanceWinner({
            tournId: TID,
            childRound: 1,
            childSlot: 0,
            winnerId: "a",
            parentRound: 0,
            parentSlot: 0,
            parentSlotIndex: 1,
            completedAt: "2026-05-09T13:00:00.000Z",
        });
        expect(ok).toBe(true);
        expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(1);
    });

    test("listByStatus queries the per-tournament status GSI partition", async () => {
        ddbMock.on(QueryCommand).resolves({ Items: [] });
        const repo = new MatchRepo(ddbMock as unknown as DynamoDBDocumentClient);
        await repo.listByStatus(TID, "live");
        const input = ddbMock.commandCalls(QueryCommand)[0]!.args[0].input;
        expect(input.IndexName).toBe("GSI1");
        expect(input.ExpressionAttributeValues![":pk"]).toBe(
            `TOURN#${TID}#MATCH#STATUS#live`,
        );
    });
});
