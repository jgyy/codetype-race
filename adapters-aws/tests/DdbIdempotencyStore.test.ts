import { describe, expect, test } from "bun:test";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DdbIdempotencyStore } from "../src/DdbIdempotencyStore";
import {
    IdempotencyConflictError,
    type IdempotencyRecord,
} from "@codetype/domain/ports/IdempotencyStore";

interface RecordedCall {
    name: string;
    input: unknown;
}

class MockClient {
    public calls: RecordedCall[] = [];
    constructor(private handler: (cmd: any) => Promise<any>) { }
    async send(cmd: any): Promise<any> {
        this.calls.push({ name: cmd.constructor.name, input: cmd.input });
        return this.handler(cmd);
    }
}

const REC: IdempotencyRecord = {
    userId: "u1",
    commandId: "c1",
    httpStatus: 200,
    body: { ok: true },
    storedAt: "2026-05-09T00:00:00.000Z",
    ttl: 3600,
};

describe("DdbIdempotencyStore", () => {
    test("get returns null for missing item", async () => {
        const client = new MockClient(async () => ({}));
        const store = new DdbIdempotencyStore({ table: "T", client: client as any });
        const r = await store.get("u1", "c1");
        expect(r).toBeNull();
        expect(client.calls[0].name).toBe("GetCommand");
        const input = client.calls[0].input as any;
        expect(input.Key).toEqual({ PK: "IDEM#u1", SK: "CMD#c1" });
    });

    test("get hydrates record from item", async () => {
        const client = new MockClient(async () => ({ Item: { ...REC } }));
        const store = new DdbIdempotencyStore({ table: "T", client: client as any });
        const r = await store.get("u1", "c1");
        expect(r).toEqual(REC);
    });

    test("put uses attribute_not_exists condition + TTL attribute", async () => {
        const client = new MockClient(async () => ({}));
        const store = new DdbIdempotencyStore({ table: "T", client: client as any });
        await store.put(REC);
        expect(client.calls[0].name).toBe("PutCommand");
        const input = client.calls[0].input as any;
        expect(input.ConditionExpression).toBe("attribute_not_exists(PK)");
        expect(input.ReturnValuesOnConditionCheckFailure).toBe("ALL_OLD");
        const expectedExpiresAt =
            Math.floor(Date.parse(REC.storedAt) / 1000) + REC.ttl;
        expect(input.Item.expiresAt).toBe(expectedExpiresAt);
        expect(input.Item.PK).toBe("IDEM#u1");
        expect(input.Item.SK).toBe("CMD#c1");
    });

    test("put on conflict throws IdempotencyConflictError with existing row from CCFE", async () => {
        const cause = new ConditionalCheckFailedException({
            $metadata: {},
            message: "conditional check failed",
        });
        (cause as any).Item = {
            userId: "u1",
            commandId: "c1",
            httpStatus: 200,
            body: { ok: true, cached: true },
            storedAt: REC.storedAt,
            ttl: REC.ttl,
        };
        const client = new MockClient(async (cmd) => {
            if (cmd instanceof PutCommand) throw cause;
            return {};
        });
        const store = new DdbIdempotencyStore({ table: "T", client: client as any });
        let caught: unknown;
        try {
            await store.put(REC);
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(IdempotencyConflictError);
        const conflict = caught as IdempotencyConflictError;
        expect(conflict.existing.body).toEqual({ ok: true, cached: true });
    });

    test("put on conflict without ALL_OLD falls back to a Get", async () => {
        const cause = new ConditionalCheckFailedException({
            $metadata: {},
            message: "conditional check failed",
        });
        const client = new MockClient(async (cmd) => {
            if (cmd instanceof PutCommand) throw cause;
            if (cmd instanceof GetCommand) return { Item: { ...REC, body: { fetched: true } } };
            return {};
        });
        const store = new DdbIdempotencyStore({ table: "T", client: client as any });
        let caught: unknown;
        try {
            await store.put(REC);
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(IdempotencyConflictError);
        const conflict = caught as IdempotencyConflictError;
        expect(conflict.existing.body).toEqual({ fetched: true });
        expect(client.calls.map((c) => c.name)).toEqual(["PutCommand", "GetCommand"]);
    });
});
