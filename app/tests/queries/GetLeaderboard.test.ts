import { describe, expect, test } from "bun:test";
import {
    GetLeaderboardHandler,
    GetLeaderboardQuery,
    type LeaderboardEntry,
    type LeaderboardProjection,
} from "../../src";

class FakeProjection implements LeaderboardProjection {
    public calls: Array<{ language?: string; limit: number }> = [];
    public entries: LeaderboardEntry[] = [];
    seed(...e: LeaderboardEntry[]) {
        this.entries = e;
        return this;
    }
    async getTop(args: { language?: string; limit: number }) {
        this.calls.push(args);
        return this.entries.slice(0, args.limit);
    }
}

describe("GetLeaderboardQuery", () => {
    test("global path: language undefined → projection called with no language", async () => {
        const proj = new FakeProjection().seed(
            { user_id: "u1", display_name: "alice", rating: 1500 },
            { user_id: "u2", display_name: "bob", rating: 1400 },
        );
        const out = await new GetLeaderboardHandler(proj).execute(
            new GetLeaderboardQuery({ limit: 10 }),
        );
        expect(out.entries).toHaveLength(2);
        expect(proj.calls[0]).toEqual({ language: undefined, limit: 10 });
    });

    test("language filter is passed through", async () => {
        const proj = new FakeProjection();
        await new GetLeaderboardHandler(proj).execute(
            new GetLeaderboardQuery({ language: "ts", limit: 5 }),
        );
        expect(proj.calls[0]).toEqual({ language: "ts", limit: 5 });
    });

    test("respects limit", async () => {
        const proj = new FakeProjection().seed(
            ...Array.from({ length: 200 }, (_, i) => ({
                user_id: `u${i}`,
                display_name: `n${i}`,
                rating: 2000 - i,
            })),
        );
        const out = await new GetLeaderboardHandler(proj).execute(
            new GetLeaderboardQuery({ limit: 100 }),
        );
        expect(out.entries).toHaveLength(100);
    });
});
