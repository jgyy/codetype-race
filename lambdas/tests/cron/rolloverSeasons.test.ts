import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
    ScanCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { rolloverSeasons } from "../../cron/rolloverSeasons";
import type { Season } from "@codetype/shared/tournaments";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = "test-table";
});
afterEach(() => ddbMock.reset());

const past = new Date("2026-04-01T00:00:00.000Z");
const expiredSeason: Season = {
    id: "2026-S1",
    status: "active",
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-04-01T00:00:00.000Z",
    decayFactor: 0.25,
    decayTarget: 1200,
};

describe("rolloverSeasons", () => {
    test("no-op when active season has not yet ended", async () => {
        const future = { ...expiredSeason, endsAt: "2099-01-01T00:00:00.000Z" };
        ddbMock.on(QueryCommand).resolves({ Items: [future] });
        const r = await rolloverSeasons({ now: past });
        expect(r.rolled).toEqual([]);
    });

    test("expired season is rolled and decay is applied", async () => {
        ddbMock
            .on(QueryCommand)
            .resolvesOnce({ Items: [expiredSeason] })
            .resolvesOnce({
                Items: [
                    { user_id: "u1", display_name: "U1", rating: 2000 },
                    { user_id: "u2", display_name: "U2", rating: 800 },
                ],
            });
        ddbMock.on(ScanCommand).resolves({
            Items: [
                { user_id: "u1", display_name: "U1", rating: 2000 },
                { user_id: "u2", display_name: "U2", rating: 800 },
            ],
            LastEvaluatedKey: undefined,
        });
        ddbMock.on(PutCommand).resolves({});
        ddbMock.on(UpdateCommand).resolves({});
        ddbMock.on(GetCommand).resolves({});

        const r = await rolloverSeasons({ now: past });
        expect(r.rolled).toEqual(["2026-S1"]);
        expect(r.snapshotted).toBe(2);
        expect(r.decayed).toBe(2);
    });

    test("partial-run resumption — second invocation does not re-decay", async () => {
        ddbMock.on(QueryCommand).resolves({ Items: [] });
        const r = await rolloverSeasons({ now: past });
        expect(r.rolled).toEqual([]);
        expect(r.decayed).toBe(0);
    });

    test("decay sentinel rejects re-application within same run", async () => {
        ddbMock
            .on(QueryCommand)
            .resolvesOnce({ Items: [expiredSeason] })
            .resolvesOnce({ Items: [] });
        ddbMock.on(ScanCommand).resolves({
            Items: [
                { user_id: "u1", display_name: "U1", rating: 1500 },
                { user_id: "u2", display_name: "U2", rating: 1500 },
            ],
            LastEvaluatedKey: undefined,
        });
        // UpdateCommand sequence:
        //   1. season active->finalizing  (success)
        //   2. decay u1                  (success)
        //   3. decay u2                  (CCF — sentinel rejects re-apply)
        //   4. season finalizing->archived (success)
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
        ddbMock.on(PutCommand).resolves({});
        ddbMock.on(GetCommand).resolves({});

        const r = await rolloverSeasons({ now: past });
        expect(r.rolled).toEqual(["2026-S1"]);
        expect(r.decayed).toBe(1);
    });
});
