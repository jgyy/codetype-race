import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    GetCommand,
    TransactWriteCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { advanceMatch } from "../../src/orchestration/advanceMatch";
import { MatchRepo } from "../../src/repos/MatchRepo";
import { TournamentRepo } from "../../src/repos/TournamentRepo";
import type { TournamentMatch } from "@codetype/shared/tournaments";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = "test-table";
});
afterEach(() => ddbMock.reset());

const TID = "11111111-1111-4111-8111-111111111111";

const liveMatch: TournamentMatch = {
    tournId: TID,
    round: 1,
    slot: 0,
    status: "live",
    players: ["a", "b"],
    winnerId: null,
    roomId: "r1",
    scheduledAt: "2026-05-09T12:00:00.000Z",
    completedAt: null,
    flagged: false,
};

/**
 * Spec acceptance: "Two simultaneous match advancements writing to the
 * same parent match — only one wins; the loser retries cleanly."
 *
 * We exercise this through the real MatchRepo.advanceWinner (which uses
 * DDB TransactWriteItems). The first call succeeds; the second raises
 * TransactionCanceledException (DDB's response when the parent slot is
 * no longer null), and advanceMatch surfaces this as `advanced: false`.
 */
describe("advanceMatch — concurrent advancement integration", () => {
    test("first caller wins, second sees advanced=false (no exception)", async () => {
        const matches = new MatchRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const tournaments = new TournamentRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );

        ddbMock.on(GetCommand).resolves({ Item: liveMatch });
        // First TransactWrite succeeds. Second mimics DDB's cancellation
        // when the conditional `parent slot is null` no longer holds.
        const cancelErr = new Error("Transaction cancelled");
        (cancelErr as { name: string }).name = "TransactionCanceledException";
        ddbMock
            .on(TransactWriteCommand)
            .resolvesOnce({})
            .rejectsOnce(cancelErr);

        const r1 = await advanceMatch({
            tournId: TID,
            round: 1,
            slot: 0,
            winnerId: "a",
            matches,
            tournaments,
        });
        const r2 = await advanceMatch({
            tournId: TID,
            round: 1,
            slot: 0,
            winnerId: "b",
            matches,
            tournaments,
        });

        expect(r1.advanced).toBe(true);
        expect(r2.advanced).toBe(false);
    });

    test("final-round (round 0) flips tournament once — second flip CAS-fails", async () => {
        const matches = new MatchRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );
        const tournaments = new TournamentRepo(
            ddbMock as unknown as DynamoDBDocumentClient,
        );

        ddbMock.on(GetCommand).resolves({
            Item: { ...liveMatch, round: 0 },
        });
        // First Update (match status live->done) succeeds; Second Update
        // (tournament running->finished) succeeds. Then for the second
        // advance call: match transition CAS fails (status no longer 'live').
        ddbMock
            .on(UpdateCommand)
            .resolvesOnce({})
            .resolvesOnce({})
            .rejectsOnce(
                new ConditionalCheckFailedException({
                    $metadata: {},
                    message: "x",
                }),
            )
            .resolves({});

        const r1 = await advanceMatch({
            tournId: TID,
            round: 0,
            slot: 0,
            winnerId: "a",
            matches,
            tournaments,
        });
        const r2 = await advanceMatch({
            tournId: TID,
            round: 0,
            slot: 0,
            winnerId: "b",
            matches,
            tournaments,
        });

        expect(r1.advanced).toBe(true);
        expect(r1.finished).toBe(true);
        expect(r2.advanced).toBe(false);
    });
});
