import { describe, expect, test } from "bun:test";
import {
    IdempotencyConflictError,
    type IdempotencyRecord,
    type IdempotencyStore,
} from "../../src/ports/IdempotencyStore";

class InMemoryIdempotencyStore implements IdempotencyStore {
    private rows = new Map<string, IdempotencyRecord>();
    private key(uid: string, cid: string) { return `${uid}\x00${cid}`; }
    async get(userId: string, commandId: string) {
        return this.rows.get(this.key(userId, commandId)) ?? null;
    }
    async put(record: IdempotencyRecord) {
        const k = this.key(record.userId, record.commandId);
        const existing = this.rows.get(k);
        if (existing) throw new IdempotencyConflictError(existing);
        this.rows.set(k, record);
    }
}

const REC: IdempotencyRecord = {
    userId: "u1",
    commandId: "c1",
    httpStatus: 200,
    body: { ok: true, raceId: "r1" },
    storedAt: "2026-05-09T00:00:00.000Z",
    ttl: 3600,
};

describe("IdempotencyStore contract", () => {
    test("get returns null when no row exists", async () => {
        const s = new InMemoryIdempotencyStore();
        expect(await s.get("u1", "c1")).toBeNull();
    });

    test("put then get returns the stored record", async () => {
        const s = new InMemoryIdempotencyStore();
        await s.put(REC);
        const got = await s.get("u1", "c1");
        expect(got).toEqual(REC);
    });

    test("duplicate put throws IdempotencyConflictError exposing the existing row", async () => {
        const s = new InMemoryIdempotencyStore();
        await s.put(REC);
        let caught: unknown;
        try {
            await s.put({ ...REC, body: { other: 1 } });
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(IdempotencyConflictError);
        const conflict = caught as IdempotencyConflictError;
        expect(conflict.existing.body).toEqual({ ok: true, raceId: "r1" });
    });

    test("different commandIds do not collide", async () => {
        const s = new InMemoryIdempotencyStore();
        await s.put(REC);
        await s.put({ ...REC, commandId: "c2", body: { ok: true, raceId: "r2" } });
        expect((await s.get("u1", "c1"))!.body).toEqual({ ok: true, raceId: "r1" });
        expect((await s.get("u1", "c2"))!.body).toEqual({ ok: true, raceId: "r2" });
    });
});
