import { describe, expect, test } from "bun:test";
import {
    DeleteCommand,
    PutCommand,
    QueryCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { DdbOutboxStore } from "../src/DdbOutboxStore";
import type { OutboxEntry } from "@codetype/domain/events/OutboxEntry";

class MockClient {
    public calls: { name: string; input: any }[] = [];
    constructor(private handler: (cmd: any) => Promise<any>) { }
    async send(cmd: any): Promise<any> {
        this.calls.push({ name: cmd.constructor.name, input: cmd.input });
        return this.handler(cmd);
    }
}

function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
    return {
        id: "01HZ-1",
        raceId: "r1",
        eventSeq: 0,
        eventType: "RACE_FINISHED",
        channel: "broadcast",
        payload: {},
        attempts: 0,
        enqueuedAt: "2026-05-09T00:00:00.000Z",
        nextAttemptAt: "2026-05-09T00:00:00.000Z",
        ...overrides,
    };
}

describe("DdbOutboxStore.claim", () => {
    test("queries PK=OUTBOX, filters on nextAttemptAt, respects limit", async () => {
        const items = [entry({ id: "a" }), entry({ id: "b" })];
        const client = new MockClient(async () => ({ Items: items }));
        const store = new DdbOutboxStore({ table: "T", client: client as any });
        const claims = await store.claim("2026-05-09T00:00:01.000Z", 10);
        expect(claims.map((c) => c.entry.id)).toEqual(["a", "b"]);
        expect(claims[0].receipt).toBe("a");
        const input = client.calls[0].input;
        expect(input.KeyConditionExpression).toBe("PK = :pk");
        expect(input.FilterExpression).toBe("nextAttemptAt <= :now");
        expect(input.ExpressionAttributeValues[":pk"]).toBe("OUTBOX");
        expect(input.ExpressionAttributeValues[":now"]).toBe("2026-05-09T00:00:01.000Z");
        expect(input.Limit).toBe(10);
    });

    test("hard-caps returned claims by limit", async () => {
        // DDB may return more than Limit when FilterExpression filters in-place
        const items = Array.from({ length: 5 }, (_, i) => entry({ id: `e${i}` }));
        const client = new MockClient(async () => ({ Items: items }));
        const store = new DdbOutboxStore({ table: "T", client: client as any });
        const claims = await store.claim("2026-05-09T00:00:01.000Z", 2);
        expect(claims).toHaveLength(2);
    });
});

describe("DdbOutboxStore.ack", () => {
    test("deletes by composite key", async () => {
        const client = new MockClient(async () => ({}));
        const store = new DdbOutboxStore({ table: "T", client: client as any });
        await store.ack({ entry: entry({ id: "x" }), receipt: "x" });
        expect(client.calls[0].name).toBe("DeleteCommand");
        expect(client.calls[0].input.Key).toEqual({ PK: "OUTBOX", SK: "x" });
    });
});

describe("DdbOutboxStore.fail", () => {
    test("increments attempts and sets nextAttemptAt with conditional", async () => {
        const client = new MockClient(async () => ({}));
        const store = new DdbOutboxStore({ table: "T", client: client as any });
        await store.fail(
            { entry: entry({ id: "x" }), receipt: "x" },
            "2026-05-09T00:00:30.000Z",
        );
        const input = client.calls[0].input;
        expect(client.calls[0].name).toBe("UpdateCommand");
        expect(input.UpdateExpression).toBe(
            "SET attempts = if_not_exists(attempts, :zero) + :one, nextAttemptAt = :next",
        );
        expect(input.ExpressionAttributeValues[":next"]).toBe("2026-05-09T00:00:30.000Z");
        expect(input.ConditionExpression).toBe("attribute_exists(PK)");
    });
});

describe("DdbOutboxStore.deadLetter", () => {
    test("puts to OUTBOX_DLQ partition then deletes from OUTBOX", async () => {
        const client = new MockClient(async () => ({}));
        const store = new DdbOutboxStore({ table: "T", client: client as any });
        await store.deadLetter(
            { entry: entry({ id: "x" }), receipt: "x" },
            "fatal: rejected by broadcast",
        );
        expect(client.calls.map((c) => c.name)).toEqual(["PutCommand", "DeleteCommand"]);
        const put = client.calls[0].input;
        expect(put.Item.PK).toBe("OUTBOX_DLQ");
        expect(put.Item.SK).toBe("x");
        expect(put.Item.reason).toBe("fatal: rejected by broadcast");
        expect(put.Item.deadLetteredAt).toBeDefined();
        const del = client.calls[1].input;
        expect(del.Key).toEqual({ PK: "OUTBOX", SK: "x" });
    });
});
