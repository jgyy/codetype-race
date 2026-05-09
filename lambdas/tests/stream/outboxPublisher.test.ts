import { describe, expect, test } from "bun:test";
import type { DynamoDBStreamEvent } from "aws-lambda";
import {
    publishOnce,
    streamHasOutboxInsert,
} from "../../src/stream/outboxPublisher";
import { pickClaimable } from "@codetype/domain/OutboxPublisher";
import { RoutingDispatcher } from "@codetype/domain/RoutingDispatcher";
import type { OutboxEntry } from "@codetype/domain/events/OutboxEntry";
import type {
    OutboxClaim,
    OutboxStore,
    Clock,
} from "@codetype/domain/ports";

class FixedClock implements Clock {
    constructor(public ms: number) { }
    epochMs() { return this.ms; }
    now() { return new Date(this.ms); }
}

class InMemoryOutbox implements OutboxStore {
    public entries = new Map<string, OutboxEntry>();
    public dlq: { entry: OutboxEntry; reason: string }[] = [];
    constructor(seed: OutboxEntry[] = []) {
        for (const e of seed) this.entries.set(e.id, e);
    }
    async claim(now: string, limit: number) {
        const ready = pickClaimable([...this.entries.values()], now, limit);
        return ready.map((entry) => ({ entry, receipt: entry.id } as OutboxClaim));
    }
    async ack(c: OutboxClaim) { this.entries.delete(c.receipt as string); }
    async fail(c: OutboxClaim, nextAttemptAt: string) {
        const id = c.receipt as string;
        const cur = this.entries.get(id);
        if (cur) this.entries.set(id, { ...cur, attempts: cur.attempts + 1, nextAttemptAt });
    }
    async deadLetter(c: OutboxClaim, reason: string) {
        const id = c.receipt as string;
        const cur = this.entries.get(id);
        if (cur) {
            this.dlq.push({ entry: cur, reason });
            this.entries.delete(id);
        }
    }
}

function makeEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
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

describe("streamHasOutboxInsert", () => {
    test("true when batch contains an INSERT on PK=OUTBOX", () => {
        const ev: DynamoDBStreamEvent = {
            Records: [
                {
                    eventName: "INSERT",
                    dynamodb: { Keys: { PK: { S: "OUTBOX" }, SK: { S: "01HZ-1" } } },
                },
            ],
        } as any;
        expect(streamHasOutboxInsert(ev)).toBe(true);
    });

    test("false when batch is purely race-event traffic", () => {
        const ev: DynamoDBStreamEvent = {
            Records: [
                {
                    eventName: "INSERT",
                    dynamodb: { Keys: { PK: { S: "RACE#abc" }, SK: { S: "EV#0000000000" } } },
                },
                {
                    eventName: "MODIFY",
                    dynamodb: { Keys: { PK: { S: "RACE#abc" }, SK: { S: "PROJ#STATE" } } },
                },
            ],
        } as any;
        expect(streamHasOutboxInsert(ev)).toBe(false);
    });

    test("false when only MODIFY/REMOVE on OUTBOX (ack/redrive traffic)", () => {
        const ev: DynamoDBStreamEvent = {
            Records: [
                {
                    eventName: "REMOVE",
                    dynamodb: { Keys: { PK: { S: "OUTBOX" }, SK: { S: "01HZ-1" } } },
                },
                {
                    eventName: "MODIFY",
                    dynamodb: { Keys: { PK: { S: "OUTBOX" }, SK: { S: "01HZ-2" } } },
                },
            ],
        } as any;
        expect(streamHasOutboxInsert(ev)).toBe(false);
    });
});

describe("publishOnce", () => {
    test("dispatches each ready entry exactly once and acks (no duplicates under happy path)", async () => {
        const store = new InMemoryOutbox([
            makeEntry({ id: "a" }),
            makeEntry({ id: "b", channel: "progression" }),
        ]);
        const seen: { channel: string; id: string }[] = [];
        const dispatcher = new RoutingDispatcher({
            broadcast: async (e) => { seen.push({ channel: "broadcast", id: e.id }); },
            progression: async (e) => { seen.push({ channel: "progression", id: e.id }); },
        });
        const clock = new FixedClock(Date.parse("2026-05-09T00:00:01.000Z"));
        const out = await publishOnce({ store, dispatcher, clock });
        expect(out.acked).toBe(2);
        expect(out.retried).toBe(0);
        expect(out.deadLettered).toBe(0);
        expect(seen).toEqual([
            { channel: "broadcast", id: "a" },
            { channel: "progression", id: "b" },
        ]);
        expect(store.entries.size).toBe(0);
    });

    test("an unregistered channel triggers retry, not silent drop", async () => {
        const store = new InMemoryOutbox([
            makeEntry({ id: "x", channel: "analytics" }),
        ]);
        const dispatcher = new RoutingDispatcher({}); // analytics intentionally missing
        const clock = new FixedClock(Date.parse("2026-05-09T00:00:01.000Z"));
        const out = await publishOnce({ store, dispatcher, clock });
        expect(out.acked).toBe(0);
        expect(out.retried).toBe(1);
        expect(store.entries.get("x")!.attempts).toBe(1);
    });

    test("simulated retry storm: same outbox row dispatched at-most-once per claim window", async () => {
        const store = new InMemoryOutbox([makeEntry({ id: "z" })]);
        let callsForZ = 0;
        const dispatcher = new RoutingDispatcher({
            broadcast: async (e) => { if (e.id === "z") callsForZ++; },
        });
        const clock = new FixedClock(Date.parse("2026-05-09T00:00:01.000Z"));
        // Run drain 5 times back-to-back (e.g., overlapping stream invocations)
        for (let i = 0; i < 5; i++) {
            await publishOnce({ store, dispatcher, clock });
        }
        // First run dispatches and acks. Subsequent runs find no entries.
        expect(callsForZ).toBe(1);
        expect(store.entries.size).toBe(0);
    });
});
