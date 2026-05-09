import { describe, expect, test } from "bun:test";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { DdbLeaderboardProjection } from "../src/DdbLeaderboardProjection";
import {
    leaderboardGlobalPK,
    leaderboardGlobalShardPK,
    leaderboardLangPK,
    leaderboardLangShardPK,
    leaderboardShardCount,
} from "@codetype/shared/ddb-keys";

interface QueryCall {
    pk: string;
    limit: number | undefined;
    projection: string | undefined;
}

class MockClient {
    public calls: QueryCall[] = [];
    constructor(
        private readonly itemsByPK: Map<string, Array<Record<string, unknown>>>,
    ) { }
    async send(cmd: QueryCommand): Promise<{ Items: Array<Record<string, unknown>> }> {
        const input = cmd.input as {
            ExpressionAttributeValues: { ":pk": string };
            Limit?: number;
            ProjectionExpression?: string;
        };
        const pk = input.ExpressionAttributeValues[":pk"];
        this.calls.push({
            pk,
            limit: input.Limit,
            projection: input.ProjectionExpression,
        });
        return { Items: this.itemsByPK.get(pk) ?? [] };
    }
}

const mkRow = (user_id: string, rating: number) => ({
    user_id,
    display_name: user_id,
    rating,
});

describe("DdbLeaderboardProjection (Phase 16.1)", () => {
    test("non-sharded mode queries single global PK", async () => {
        const items = new Map<string, Array<Record<string, unknown>>>([
            [leaderboardGlobalPK(), [mkRow("u1", 1500), mkRow("u2", 1400)]],
        ]);
        const client = new MockClient(items);
        const p = new DdbLeaderboardProjection({
            table: "T",
            client: client as never,
        });
        const top = await p.getTop({ limit: 10 });
        expect(top.map((t) => t.user_id)).toEqual(["u1", "u2"]);
        expect(client.calls).toHaveLength(1);
        expect(client.calls[0].pk).toBe(leaderboardGlobalPK());
    });

    test("non-sharded mode queries single language PK", async () => {
        const items = new Map<string, Array<Record<string, unknown>>>([
            [leaderboardLangPK("ts"), [mkRow("u1", 1500)]],
        ]);
        const client = new MockClient(items);
        const p = new DdbLeaderboardProjection({
            table: "T",
            client: client as never,
            shardedLanguages: new Set(["py"]), // ts is NOT sharded
        });
        await p.getTop({ language: "ts", limit: 10 });
        expect(client.calls).toHaveLength(1);
        expect(client.calls[0].pk).toBe(leaderboardLangPK("ts"));
    });

    test("sharded mode fans out to all 16 shard PKs in parallel and merges", async () => {
        const items = new Map<string, Array<Record<string, unknown>>>();
        // Spread 5 users across 3 shards; merged top-3 should be by rating desc.
        items.set(leaderboardGlobalShardPK(0), [
            mkRow("alice", 1700),
            mkRow("bob", 1300),
        ]);
        items.set(leaderboardGlobalShardPK(7), [
            mkRow("carol", 1800),
            mkRow("dave", 1100),
        ]);
        items.set(leaderboardGlobalShardPK(15), [mkRow("erin", 1600)]);
        const client = new MockClient(items);
        const p = new DdbLeaderboardProjection({
            table: "T",
            client: client as never,
            shardedLanguages: new Set(["*"]),
        });
        const top = await p.getTop({ limit: 3 });
        expect(top.map((t) => t.user_id)).toEqual(["carol", "alice", "erin"]);
        expect(client.calls).toHaveLength(leaderboardShardCount);
        // Each shard query should use a projection expression (cost trim).
        expect(client.calls.every((c) => c.projection !== undefined)).toBe(true);
        const queriedPKs = new Set(client.calls.map((c) => c.pk));
        for (let s = 0; s < leaderboardShardCount; s++) {
            expect(queriedPKs.has(leaderboardGlobalShardPK(s))).toBe(true);
        }
    });

    test("sharded mode uses language shard PKs when language flag is set", async () => {
        const items = new Map<string, Array<Record<string, unknown>>>();
        items.set(leaderboardLangShardPK("ts", 3), [mkRow("u1", 1234)]);
        const client = new MockClient(items);
        const p = new DdbLeaderboardProjection({
            table: "T",
            client: client as never,
            shardedLanguages: new Set(["ts"]),
        });
        await p.getTop({ language: "ts", limit: 5 });
        expect(client.calls).toHaveLength(leaderboardShardCount);
        for (let s = 0; s < leaderboardShardCount; s++) {
            expect(client.calls.find((c) => c.pk === leaderboardLangShardPK("ts", s)))
                .toBeDefined();
        }
    });

    test("sharded merge dedups by user_id, keeping highest rating", async () => {
        // Defensive: a user appearing twice (e.g. mid-migration stale row)
        // should not be double-counted; the higher rating wins.
        const items = new Map<string, Array<Record<string, unknown>>>();
        items.set(leaderboardGlobalShardPK(0), [mkRow("dup", 1500)]);
        items.set(leaderboardGlobalShardPK(1), [mkRow("dup", 1700)]);
        const client = new MockClient(items);
        const p = new DdbLeaderboardProjection({
            table: "T",
            client: client as never,
            shardedLanguages: new Set(["*"]),
        });
        const top = await p.getTop({ limit: 5 });
        expect(top).toEqual([{ user_id: "dup", display_name: "dup", rating: 1700 }]);
    });
});
