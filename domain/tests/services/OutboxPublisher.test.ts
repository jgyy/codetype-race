import { describe, expect, test } from "bun:test";
import {
    drainOnce,
    outboxEntryFor,
    pickClaimable,
} from "../../src/services/OutboxPublisher";
import {
    MAX_OUTBOX_ATTEMPTS,
    backoffMs,
    type OutboxEntry,
} from "../../src/events/OutboxEntry";
import type {
    OutboxClaim,
    OutboxDispatcher,
    OutboxStore,
} from "../../src/ports/OutboxStore";
import type { Clock } from "../../src/ports/Clock";

class FixedClock implements Clock {
    constructor(public ms: number) { }
    epochMs() { return this.ms; }
    now() { return new Date(this.ms); }
}

function makeEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
    const base = outboxEntryFor({
        id: "01HZ-1",
        raceId: "r1",
        eventSeq: 0,
        eventType: "RACE_FINISHED",
        channel: "broadcast",
        payload: {},
        enqueuedAt: "2026-05-09T00:00:00.000Z",
    });
    return { ...base, ...overrides };
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
    async ack(claim: OutboxClaim) {
        this.entries.delete((claim.receipt as string));
    }
    async fail(claim: OutboxClaim, nextAttemptAt: string) {
        const id = claim.receipt as string;
        const cur = this.entries.get(id);
        if (!cur) return;
        this.entries.set(id, { ...cur, attempts: cur.attempts + 1, nextAttemptAt });
    }
    async deadLetter(claim: OutboxClaim, reason: string) {
        const id = claim.receipt as string;
        const cur = this.entries.get(id);
        if (cur) {
            this.dlq.push({ entry: cur, reason });
            this.entries.delete(id);
        }
    }
}

class CountingDispatcher implements OutboxDispatcher {
    public calls: { channel: string; id: string }[] = [];
    constructor(private failIds: Set<string> = new Set()) { }
    async dispatch(channel: string, entry: OutboxEntry) {
        this.calls.push({ channel, id: entry.id });
        if (this.failIds.has(entry.id)) throw new Error(`forced fail: ${entry.id}`);
    }
}

describe("backoffMs", () => {
    test("doubles per attempt, capped at 30s", () => {
        expect(backoffMs(0)).toBe(250);
        expect(backoffMs(1)).toBe(500);
        expect(backoffMs(2)).toBe(1000);
        expect(backoffMs(10)).toBe(30_000);
        expect(() => backoffMs(-1)).toThrow();
    });
});

describe("pickClaimable", () => {
    test("filters out entries scheduled in the future, sorted by nextAttemptAt", () => {
        const now = "2026-05-09T00:00:00.000Z";
        const future = makeEntry({ id: "f", nextAttemptAt: "2026-05-09T00:01:00.000Z" });
        const ready1 = makeEntry({ id: "r1", nextAttemptAt: "2026-05-09T00:00:00.000Z" });
        const ready2 = makeEntry({ id: "r2", nextAttemptAt: "2026-04-09T00:00:00.000Z" });
        const out = pickClaimable([future, ready1, ready2], now, 10);
        expect(out.map((e) => e.id)).toEqual(["r2", "r1"]);
    });
});

describe("drainOnce", () => {
    test("acks successfully-dispatched entries", async () => {
        const store = new InMemoryOutbox([makeEntry({ id: "a" }), makeEntry({ id: "b" })]);
        const disp = new CountingDispatcher();
        const clock = new FixedClock(Date.parse("2026-05-09T00:00:01.000Z"));
        const out = await drainOnce(store, disp, clock);
        expect(out).toEqual({ claimed: 2, acked: 2, retried: 0, deadLettered: 0 });
        expect(store.entries.size).toBe(0);
        expect(disp.calls.map((c) => c.id).sort()).toEqual(["a", "b"]);
    });

    test("retries failures with backoff; entry stays in store with bumped attempts", async () => {
        const entry = makeEntry({ id: "x" });
        const store = new InMemoryOutbox([entry]);
        const disp = new CountingDispatcher(new Set(["x"]));
        const clock = new FixedClock(Date.parse("2026-05-09T00:00:01.000Z"));
        const out = await drainOnce(store, disp, clock);
        expect(out).toEqual({ claimed: 1, acked: 0, retried: 1, deadLettered: 0 });
        const updated = store.entries.get("x")!;
        expect(updated.attempts).toBe(1);
        const expectedAt = new Date(clock.ms + backoffMs(1)).toISOString();
        expect(updated.nextAttemptAt).toBe(expectedAt);
    });

    test("dead-letters after MAX_OUTBOX_ATTEMPTS - 1 prior failures", async () => {
        const entry = makeEntry({ id: "y" });
        const seeded = { ...entry, attempts: MAX_OUTBOX_ATTEMPTS - 1 };
        const store = new InMemoryOutbox([seeded]);
        const disp = new CountingDispatcher(new Set(["y"]));
        const clock = new FixedClock(Date.parse("2026-05-09T00:00:01.000Z"));
        const out = await drainOnce(store, disp, clock);
        expect(out).toEqual({ claimed: 1, acked: 0, retried: 0, deadLettered: 1 });
        expect(store.entries.size).toBe(0);
        expect(store.dlq).toHaveLength(1);
        expect(store.dlq[0].reason).toMatch(/forced fail/);
    });

    test("respects batchSize", async () => {
        const seeds = Array.from({ length: 10 }, (_, i) => makeEntry({ id: `e${i}` }));
        const store = new InMemoryOutbox(seeds);
        const disp = new CountingDispatcher();
        const clock = new FixedClock(Date.parse("2026-05-09T00:00:01.000Z"));
        const out = await drainOnce(store, disp, clock, { batchSize: 3 });
        expect(out.claimed).toBe(3);
        expect(out.acked).toBe(3);
        expect(store.entries.size).toBe(7);
    });

    test("does not claim entries scheduled in the future", async () => {
        const future = makeEntry({ id: "later", nextAttemptAt: "2026-05-09T01:00:00.000Z" });
        const ready = makeEntry({ id: "now" });
        const store = new InMemoryOutbox([future, ready]);
        const disp = new CountingDispatcher();
        const clock = new FixedClock(Date.parse("2026-05-09T00:00:00.000Z"));
        const out = await drainOnce(store, disp, clock);
        expect(out.claimed).toBe(1);
        expect(disp.calls).toEqual([{ channel: "broadcast", id: "now" }]);
        expect(store.entries.has("later")).toBe(true);
    });
});
