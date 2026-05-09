import { describe, expect, test } from "bun:test";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DdbRaceProjectionStore } from "../src/DdbRaceProjectionStore";
import { ProjectionConflictError } from "@codetype/domain/ports/RaceProjectionStore";
import type { RaceState } from "@codetype/domain/RaceReducer";

class MockClient {
    public calls: { name: string; input: any }[] = [];
    constructor(private handler: (cmd: any) => Promise<any>) { }
    async send(cmd: any): Promise<any> {
        this.calls.push({ name: cmd.constructor.name, input: cmd.input });
        return this.handler(cmd);
    }
}

const RID = "11111111-1111-4111-8111-111111111111";

const STATE: RaceState = {
    id: RID,
    status: "racing",
    players: {
        u1: {
            userId: "u1",
            displayName: "A",
            charsTyped: 25,
            errors: 0,
            accuracy: 1,
            wpm: 70,
            finishedAt: null,
            flags: [],
        },
    },
    countdownStartedAt: "2026-05-09T00:00:00.000Z",
    startedAt: "2026-05-09T00:00:03.000Z",
    finishedAt: null,
    lastSeq: 7,
};

describe("DdbRaceProjectionStore.get", () => {
    test("returns null when no projection exists", async () => {
        const client = new MockClient(async () => ({}));
        const store = new DdbRaceProjectionStore({
            table: "T",
            client: client as any,
        });
        expect(await store.get(RID)).toBeNull();
        expect(client.calls[0].name).toBe("GetCommand");
        expect(client.calls[0].input.Key).toEqual({
            PK: `RACE#${RID}`,
            SK: "PROJ#STATE",
        });
    });

    test("hydrates RaceState from item", async () => {
        const client = new MockClient(async () => ({ Item: { ...STATE } }));
        const store = new DdbRaceProjectionStore({
            table: "T",
            client: client as any,
        });
        const got = await store.get(RID);
        expect(got).toEqual(STATE);
    });
});

describe("DdbRaceProjectionStore.put", () => {
    test("first write uses attribute_not_exists(PK)", async () => {
        const client = new MockClient(async () => ({}));
        const store = new DdbRaceProjectionStore({
            table: "T",
            client: client as any,
        });
        await store.put({ raceId: RID, state: STATE, expectedLastSeq: null });
        const input = client.calls[0].input;
        expect(input.ConditionExpression).toBe("attribute_not_exists(PK)");
        expect(input.ExpressionAttributeValues).toBeUndefined();
        expect(input.Item.PK).toBe(`RACE#${RID}`);
        expect(input.Item.SK).toBe("PROJ#STATE");
        expect(input.Item.lastSeq).toBe(7);
        expect(input.Item.updatedAt).toBeDefined();
    });

    test("update uses lastSeq optimistic-concurrency condition", async () => {
        const client = new MockClient(async () => ({}));
        const store = new DdbRaceProjectionStore({
            table: "T",
            client: client as any,
        });
        await store.put({ raceId: RID, state: STATE, expectedLastSeq: 5 });
        const input = client.calls[0].input;
        expect(input.ConditionExpression).toBe(
            "attribute_exists(PK) AND lastSeq = :expected",
        );
        expect(input.ExpressionAttributeValues[":expected"]).toBe(5);
    });

    test("CCFE becomes ProjectionConflictError", async () => {
        const cause = new ConditionalCheckFailedException({
            $metadata: {},
            message: "conditional check failed",
        });
        const client = new MockClient(async () => {
            throw cause;
        });
        const store = new DdbRaceProjectionStore({
            table: "T",
            client: client as any,
        });
        let caught: unknown;
        try {
            await store.put({ raceId: RID, state: STATE, expectedLastSeq: 5 });
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(ProjectionConflictError);
        expect((caught as Error).message).toMatch(/expected 5/);
    });
});
