import { describe, expect, test } from "bun:test";
import {
    BroadcastEventDispatcher,
    frameFromOutbox,
} from "../../src/stream/broadcastEventDispatcher";
import { WsServerEventAppendSchema } from "@codetype/shared/schemas";
import type { OutboxEntry } from "@codetype/domain/events/OutboxEntry";
import type {
    Broadcaster,
    ConnectionRecord,
    ConnectionRepo,
} from "@codetype/domain";

const RID = "11111111-1111-4111-8111-111111111111";
const CORR = "22222222-2222-4222-8222-222222222222";

function fullEventOutbox(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
    return {
        id: "ob-1",
        raceId: RID,
        eventSeq: 3,
        eventType: "PLAYER_JOINED",
        channel: "broadcast",
        attempts: 0,
        enqueuedAt: "2026-05-09T00:00:00.000Z",
        nextAttemptAt: "2026-05-09T00:00:00.000Z",
        // Mirrors what RaceCommandBus writes: outbox.payload = full event
        payload: {
            raceId: RID,
            seq: 3,
            type: "PLAYER_JOINED",
            occurredAt: "2026-05-09T00:00:01.000Z",
            actorId: "u1",
            payload: { userId: "u1", displayName: "A" },
            commandId: null,
            causationId: null,
            correlationId: CORR,
        },
        ...overrides,
    };
}

class FakeConnections implements ConnectionRepo {
    public conns = new Map<string, string[]>();
    constructor(seed: Record<string, string[]> = {}) {
        for (const [k, v] of Object.entries(seed)) this.conns.set(k, v);
    }
    async listByRoom(roomId: string) { return this.conns.get(roomId) ?? []; }
    async put() { return; }
    async byConnectionId(): Promise<ConnectionRecord | null> { return null; }
    async delete() { return; }
    async touch() { return; }
    async consumeChatToken() { return; }
}

class FakeBroadcaster implements Broadcaster {
    public sent: { connectionId: string; payload: unknown }[] = [];
    public disconnected: string[] = [];
    constructor(private failIds: Set<string> = new Set()) { }
    async postTo(connectionId: string, payload: unknown) {
        this.sent.push({ connectionId, payload });
        return !this.failIds.has(connectionId);
    }
    async disconnect(connectionId: string) {
        this.disconnected.push(connectionId);
    }
}

class FakeConnectionsWithRows implements ConnectionRepo {
    public rows = new Map<string, ConnectionRecord[]>();
    public dropCounters = new Map<string, number>();
    constructor(seed: Record<string, ConnectionRecord[]> = {}) {
        for (const [k, v] of Object.entries(seed)) this.rows.set(k, v);
    }
    async listByRoom(roomId: string) {
        return (this.rows.get(roomId) ?? []).map((r) => r.connection_id);
    }
    async listRowsByRoom(roomId: string) {
        return this.rows.get(roomId) ?? [];
    }
    async incrementConsecutiveDrops(connectionId: string) {
        const next = (this.dropCounters.get(connectionId) ?? 0) + 1;
        this.dropCounters.set(connectionId, next);
        return next;
    }
    async put() { return; }
    async byConnectionId(): Promise<ConnectionRecord | null> { return null; }
    async delete() { return; }
    async touch() { return; }
    async consumeChatToken() { return; }
}

describe("frameFromOutbox", () => {
    test("hydrates a valid EVENT_APPEND frame", () => {
        const frame = frameFromOutbox(fullEventOutbox());
        expect(frame).not.toBeNull();
        // Frame must validate against the public WS schema.
        expect(() => WsServerEventAppendSchema.parse(frame)).not.toThrow();
        expect(frame!.type).toBe("event-append");
        expect(frame!.raceId).toBe(RID);
        expect(frame!.seq).toBe(3);
        expect(frame!.eventType).toBe("PLAYER_JOINED");
        expect(frame!.actorId).toBe("u1");
        expect(frame!.payload).toEqual({ userId: "u1", displayName: "A" });
    });

    test("returns null for malformed outbox payload (missing occurredAt/correlationId)", () => {
        const ob = fullEventOutbox({ payload: { foo: "bar" } });
        expect(frameFromOutbox(ob)).toBeNull();
    });

    test("treats null actorId as null on the frame", () => {
        const ob = fullEventOutbox({
            payload: {
                ...fullEventOutbox().payload,
                actorId: null,
            },
        });
        expect(frameFromOutbox(ob)!.actorId).toBeNull();
    });
});

describe("BroadcastEventDispatcher.dispatch", () => {
    test("fans out the EVENT_APPEND frame to every connection in the room", async () => {
        const conns = new FakeConnections({ [RID]: ["c1", "c2", "c3"] });
        const bc = new FakeBroadcaster();
        const d = new BroadcastEventDispatcher({ connections: conns, broadcaster: bc });
        await d.dispatch(fullEventOutbox());
        expect(bc.sent.map((s) => s.connectionId).sort()).toEqual(["c1", "c2", "c3"]);
        for (const s of bc.sent) {
            expect((s.payload as any).type).toBe("event-append");
            expect((s.payload as any).seq).toBe(3);
        }
    });

    test("no-op (no error) when room has no connections — common after a finish", async () => {
        const conns = new FakeConnections({ [RID]: [] });
        const bc = new FakeBroadcaster();
        const d = new BroadcastEventDispatcher({ connections: conns, broadcaster: bc });
        await d.dispatch(fullEventOutbox());
        expect(bc.sent).toHaveLength(0);
    });

    test("partial-failure: one stale connection doesn't fail the whole dispatch", async () => {
        const conns = new FakeConnections({ [RID]: ["c1", "c2", "c3"] });
        const bc = new FakeBroadcaster(new Set(["c2"]));
        const d = new BroadcastEventDispatcher({ connections: conns, broadcaster: bc });
        await d.dispatch(fullEventOutbox());
        // No throw — outbox row will be acked even though c2 was stale
        expect(bc.sent).toHaveLength(3);
    });

    test("total-failure: every postTo fails -> dispatch throws so outbox retries", async () => {
        const conns = new FakeConnections({ [RID]: ["c1", "c2"] });
        const bc = new FakeBroadcaster(new Set(["c1", "c2"]));
        const d = new BroadcastEventDispatcher({ connections: conns, broadcaster: bc });
        await expect(d.dispatch(fullEventOutbox())).rejects.toThrow(
            /reached 0\/2 connections/,
        );
    });

    test("malformed payload -> dispatch throws so outbox retries (would otherwise lose the frame)", async () => {
        const conns = new FakeConnections({ [RID]: ["c1"] });
        const bc = new FakeBroadcaster();
        const d = new BroadcastEventDispatcher({ connections: conns, broadcaster: bc });
        const bad = fullEventOutbox({ payload: { wrong: true } });
        await expect(d.dispatch(bad)).rejects.toThrow(/malformed payload/);
    });

    // Phase 16.7 — drop-on-slow tests.
    const conn = (
        connection_id: string,
        last_ack_seq?: number,
        consecutive_drops?: number,
    ): ConnectionRecord => ({
        connection_id,
        display_name: connection_id,
        PK: `ROOM#${RID}`,
        SK: `CONN#${connection_id}`,
        last_ack_seq,
        consecutive_drops,
    });

    test("drop-on-slow: stalled connection (lag > 100) is skipped, healthy ones get the frame", async () => {
        const big = fullEventOutbox({ eventSeq: 500 });
        const conns = new FakeConnectionsWithRows({
            [RID]: [
                conn("c-fresh", 499), // gap = 1
                conn("c-stalled", 100), // gap = 400
                conn("c-cold", undefined), // never acked
            ],
        });
        const bc = new FakeBroadcaster();
        const d = new BroadcastEventDispatcher({ connections: conns, broadcaster: bc });
        await d.dispatch(big);
        const sentIds = bc.sent.map((s) => s.connectionId).sort();
        expect(sentIds).toEqual(["c-cold", "c-fresh"]);
        expect(conns.dropCounters.get("c-stalled")).toBe(1);
    });

    test("drop-on-slow: 5 consecutive drops triggers force-disconnect", async () => {
        const big = fullEventOutbox({ eventSeq: 500 });
        const conns = new FakeConnectionsWithRows({
            [RID]: [conn("c-stuck", 100, 4)], // already 4 drops; this one tips it
        });
        // Simulate the "already 4 drops" by pre-seeding the counter so the
        // dispatcher's increment lands at exactly 5 (= threshold).
        conns.dropCounters.set("c-stuck", 4);
        const bc = new FakeBroadcaster();
        const d = new BroadcastEventDispatcher({ connections: conns, broadcaster: bc });
        await d.dispatch(big);
        expect(bc.sent).toHaveLength(0);
        expect(bc.disconnected).toEqual(["c-stuck"]);
    });

    test("drop-on-slow: drop-only round does not throw (acked outbox row)", async () => {
        const big = fullEventOutbox({ eventSeq: 500 });
        const conns = new FakeConnectionsWithRows({
            [RID]: [conn("c-stalled", 100)],
        });
        const bc = new FakeBroadcaster();
        const d = new BroadcastEventDispatcher({ connections: conns, broadcaster: bc });
        await expect(d.dispatch(big)).resolves.toBeUndefined();
    });
});
