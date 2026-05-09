import { describe, expect, test } from "bun:test";
import {
    BatchGetCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { queryGsiThenHydrate } from "../src/queryGsiThenHydrate";

interface Recorded {
    name: string;
    input: unknown;
}

class MockClient {
    public calls: Recorded[] = [];
    constructor(private readonly handler: (cmd: unknown) => unknown) { }
    async send(cmd: unknown): Promise<unknown> {
        this.calls.push({
            name: (cmd as { constructor: { name: string } }).constructor.name,
            input: (cmd as { input: unknown }).input,
        });
        return this.handler(cmd);
    }
}

describe("queryGsiThenHydrate (Phase 16.6)", () => {
    test("KEYS_ONLY items trigger BatchGet then preserve Query order", async () => {
        const queryItems = [
            { PK: "P#a", SK: "META" },
            { PK: "P#b", SK: "META" },
            { PK: "P#c", SK: "META" },
        ];
        const hydrated = [
            { PK: "P#c", SK: "META", value: 30 },
            { PK: "P#a", SK: "META", value: 10 },
            { PK: "P#b", SK: "META", value: 20 },
        ];
        const client = new MockClient((cmd) => {
            if (cmd instanceof QueryCommand) return { Items: queryItems };
            if (cmd instanceof BatchGetCommand)
                return { Responses: { T: hydrated } };
            return {};
        });
        const out = await queryGsiThenHydrate<{ value: number }>(
            client as never,
            "T",
            { TableName: "T" },
        );
        expect(out.map((o) => o.value)).toEqual([10, 20, 30]);
        expect(client.calls.map((c) => c.name)).toEqual([
            "QueryCommand",
            "BatchGetCommand",
        ]);
    });

    test("hydrated items (legacy ALL projection) skip BatchGet", async () => {
        const items = [{ PK: "P#a", SK: "META", value: 1 }];
        const client = new MockClient(() => ({ Items: items }));
        const out = await queryGsiThenHydrate<{ value: number }>(
            client as never,
            "T",
            { TableName: "T" },
        );
        expect(out).toEqual(items as never);
        expect(client.calls).toHaveLength(1);
        expect(client.calls[0].name).toBe("QueryCommand");
    });

    test("post-hydrate filter applies after BatchGet", async () => {
        const queryItems = [
            { PK: "P#a", SK: "META" },
            { PK: "P#b", SK: "META" },
        ];
        const hydrated = [
            { PK: "P#a", SK: "META", status: "approved" },
            { PK: "P#b", SK: "META", status: "pending" },
        ];
        const client = new MockClient((cmd) =>
            cmd instanceof QueryCommand
                ? { Items: queryItems }
                : { Responses: { T: hydrated } },
        );
        const out = await queryGsiThenHydrate<{ status: string }>(
            client as never,
            "T",
            { TableName: "T" },
            (i) => i.status === "approved",
        );
        expect(out).toHaveLength(1);
        expect(out[0].status).toBe("approved");
    });

    test("empty Query returns empty array without BatchGet", async () => {
        const client = new MockClient(() => ({ Items: [] }));
        const out = await queryGsiThenHydrate(client as never, "T", {
            TableName: "T",
        });
        expect(out).toEqual([]);
        expect(client.calls).toHaveLength(1);
    });

    test("items deleted between Query and BatchGet are dropped", async () => {
        const queryItems = [
            { PK: "P#a", SK: "META" },
            { PK: "P#b", SK: "META" },
        ];
        const hydrated = [{ PK: "P#a", SK: "META", value: 1 }];
        const client = new MockClient((cmd) =>
            cmd instanceof QueryCommand
                ? { Items: queryItems }
                : { Responses: { T: hydrated } },
        );
        const out = await queryGsiThenHydrate<{ value: number }>(
            client as never,
            "T",
            { TableName: "T" },
        );
        expect(out).toHaveLength(1);
    });
});
