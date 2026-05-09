import { describe, expect, test } from "bun:test";
import {
    QueryCommand,
    TransactWriteCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { DdbRaceEventStore } from "../src/DdbRaceEventStore";
import { TransactionConflictError } from "@codetype/domain/ports/RaceEventStore";
import type { RaceEvent } from "@codetype/domain/events/RaceEvent";
import type { OutboxEntry } from "@codetype/domain/events/OutboxEntry";

class MockClient {
    public calls: { name: string; input: any }[] = [];
    constructor(private handler: (cmd: any) => Promise<any>) { }
    async send(cmd: any): Promise<any> {
        this.calls.push({ name: cmd.constructor.name, input: cmd.input });
        return this.handler(cmd);
    }
}

const RID = "11111111-1111-4111-8111-111111111111";
const CORR = "22222222-2222-4222-8222-222222222222";

function ev(seq: number, type: RaceEvent["type"] = "RACE_CREATED"): RaceEvent {
    return {
        raceId: RID,
        seq,
        type,
        occurredAt: "2026-05-09T00:00:00.000Z",
        actorId: null,
        payload: {},
        commandId: null,
        causationId: null,
        correlationId: CORR,
    };
}

describe("DdbRaceEventStore.allocateSeqs", () => {
    test("returns N consecutive seqs from new counter value", async () => {
        const client = new MockClient(async () => ({
            Attributes: { nextSeq: 5 },
        }));
        const store = new DdbRaceEventStore({ table: "T", client: client as any });
        const seqs = await store.allocateSeqs(RID, 3);
        expect(seqs).toEqual([2, 3, 4]);
        const input = client.calls[0].input;
        expect(input.Key).toEqual({ PK: `RACE#${RID}`, SK: "COUNTER" });
        expect(input.UpdateExpression).toBe(
            "SET nextSeq = if_not_exists(nextSeq, :zero) + :n",
        );
        expect(input.ExpressionAttributeValues[":n"]).toBe(3);
        expect(input.ReturnValues).toBe("UPDATED_NEW");
    });

    test("first allocation against fresh counter starts at 0", async () => {
        const client = new MockClient(async () => ({
            Attributes: { nextSeq: 1 },
        }));
        const store = new DdbRaceEventStore({ table: "T", client: client as any });
        const seqs = await store.allocateSeqs(RID, 1);
        expect(seqs).toEqual([0]);
    });

    test("rejects non-positive count", async () => {
        const client = new MockClient(async () => ({}));
        const store = new DdbRaceEventStore({ table: "T", client: client as any });
        await expect(store.allocateSeqs(RID, 0)).rejects.toThrow();
        await expect(store.allocateSeqs(RID, -1)).rejects.toThrow();
        await expect(store.allocateSeqs(RID, 1.5)).rejects.toThrow();
    });

    test("throws on suspect counter value", async () => {
        const client = new MockClient(async () => ({
            Attributes: { nextSeq: 1 },
        }));
        const store = new DdbRaceEventStore({ table: "T", client: client as any });
        // count=5 but counter only 1 → would yield negative start
        await expect(store.allocateSeqs(RID, 5)).rejects.toThrow(/unexpected/);
    });
});

describe("DdbRaceEventStore.appendCommand", () => {
    test("emits a single TransactWriteCommand with events + outbox + idempotency", async () => {
        const client = new MockClient(async () => ({}));
        const store = new DdbRaceEventStore({ table: "T", client: client as any });
        const outbox: OutboxEntry = {
            id: "01HZ-1",
            raceId: RID,
            eventSeq: 0,
            eventType: "RACE_CREATED",
            channel: "broadcast",
            payload: {},
            attempts: 0,
            enqueuedAt: "2026-05-09T00:00:00.000Z",
            nextAttemptAt: "2026-05-09T00:00:00.000Z",
        };
        await store.appendCommand({
            events: [ev(0), ev(1, "PLAYER_JOINED")],
            outboxEntries: [outbox],
            idempotency: {
                userId: "u1",
                commandId: "c1",
                httpStatus: 200,
                body: { ok: true },
                storedAt: "2026-05-09T00:00:00.000Z",
                ttl: 3600,
            },
        });

        expect(client.calls).toHaveLength(1);
        expect(client.calls[0].name).toBe("TransactWriteCommand");
        const items = client.calls[0].input.TransactItems;
        expect(items).toHaveLength(4);

        // event 0 — must carry attribute_not_exists guard + zero-padded SK
        expect(items[0].Put.Item.PK).toBe(`RACE#${RID}`);
        expect(items[0].Put.Item.SK).toBe("EV#0000000000");
        expect(items[0].Put.Item.GSI1PK).toBe("EV#TYPE#RACE_CREATED");
        expect(items[0].Put.Item.GSI1SK).toBe("2026-05-09T00:00:00.000Z");
        expect(items[0].Put.ConditionExpression).toBe("attribute_not_exists(SK)");

        // event 1 — different type, different seq
        expect(items[1].Put.Item.SK).toBe("EV#0000000001");
        expect(items[1].Put.Item.GSI1PK).toBe("EV#TYPE#PLAYER_JOINED");

        // outbox row
        expect(items[2].Put.Item.PK).toBe("OUTBOX");
        expect(items[2].Put.Item.SK).toBe("01HZ-1");

        // idempotency row
        expect(items[3].Put.Item.PK).toBe("IDEM#u1");
        expect(items[3].Put.Item.SK).toBe("CMD#c1");
        expect(items[3].Put.Item.expiresAt).toBe(
            Math.floor(Date.parse("2026-05-09T00:00:00.000Z") / 1000) + 3600,
        );
        expect(items[3].Put.ConditionExpression).toBe("attribute_not_exists(PK)");
    });

    test("appendCommand with no items is a no-op (no SDK call)", async () => {
        const client = new MockClient(async () => ({}));
        const store = new DdbRaceEventStore({ table: "T", client: client as any });
        await store.appendCommand({ events: [] });
        expect(client.calls).toHaveLength(0);
    });

    test("translates TransactionCanceledException into TransactionConflictError", async () => {
        const cause = new TransactionCanceledException({
            $metadata: {},
            message: "Transaction cancelled",
            CancellationReasons: [
                { Code: "ConditionalCheckFailed" },
                { Code: "None" },
            ],
        });
        const client = new MockClient(async () => {
            throw cause;
        });
        const store = new DdbRaceEventStore({ table: "T", client: client as any });
        let caught: unknown;
        try {
            await store.appendCommand({ events: [ev(0)] });
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(TransactionConflictError);
        expect((caught as Error).message).toMatch(/ConditionalCheckFailed/);
    });
});

describe("DdbRaceEventStore.listEvents", () => {
    test("queries by PK + SK > sinceSeq and hydrates events", async () => {
        const client = new MockClient(async () => ({
            Items: [
                {
                    PK: `RACE#${RID}`,
                    SK: "EV#0000000003",
                    raceId: RID,
                    seq: 3,
                    type: "PLAYER_JOINED",
                    occurredAt: "2026-05-09T00:00:00.000Z",
                    actorId: "u1",
                    payload: { userId: "u1" },
                    commandId: null,
                    causationId: null,
                    correlationId: CORR,
                },
                // Stray non-event item that snuck through (e.g. PROJ#STATE) — filtered out.
                { PK: `RACE#${RID}`, SK: "PROJ#STATE", status: "lobby" },
            ],
        }));
        const store = new DdbRaceEventStore({ table: "T", client: client as any });
        const events = await store.listEvents({
            raceId: RID,
            sinceSeq: 2,
            limit: 10,
        });
        expect(events).toHaveLength(1);
        expect(events[0].seq).toBe(3);
        expect(events[0].type).toBe("PLAYER_JOINED");
        expect(events[0].actorId).toBe("u1");
        const input = client.calls[0].input;
        expect(input.KeyConditionExpression).toBe("PK = :pk AND SK > :sk");
        expect(input.ExpressionAttributeValues[":pk"]).toBe(`RACE#${RID}`);
        expect(input.ExpressionAttributeValues[":sk"]).toBe("EV#0000000002");
        expect(input.ScanIndexForward).toBe(true);
    });
});
