import { describe, expect, test } from "bun:test";
import { DomainError } from "@codetype/domain";
import {
    FinishRaceCommand,
    FinishRaceHandler,
    type AppliedDelta,
    type FeedAppender,
    type RaceFinishedEmitter,
    type AntiCheatMetrics,
    type RaceResultInput,
    type TeamRoomReader,
    type TeamRatingApplier,
    type UserRatingsApplier,
} from "../../src";
import {
    FakeBroadcaster,
    FakeClock,
    InMemoryConnectionRepo,
    InMemoryRoomRepo,
    InMemorySnippetRepo,
} from "../fakes";

class FakeUsers implements UserRatingsApplier {
    profiles = new Map<string, { rating: number; user_id: string }>();
    applyCalls: Array<{
        roomId: string;
        language: string;
        participants: RaceResultInput[];
    }> = [];
    seed(userId: string, rating: number) {
        this.profiles.set(userId, { user_id: userId, rating });
        return this;
    }
    async getOrCreate(userId: string, _displayName: string) {
        let p = this.profiles.get(userId);
        if (!p) {
            p = { user_id: userId, rating: 1000 };
            this.profiles.set(userId, p);
        }
        return p;
    }
    async applyRaceResults(
        roomId: string,
        language: string,
        participants: RaceResultInput[],
    ): Promise<AppliedDelta[]> {
        this.applyCalls.push({ roomId, language, participants });
        return participants.map((p) => ({
            userId: p.userId,
            displayName: p.displayName,
            delta: p.delta,
            newRating: p.profile.rating + p.delta,
        }));
    }
}

class FakeFeed implements FeedAppender {
    appended: Array<{ userId: string; type: string; payload: unknown }> = [];
    async append(userId: string, type: string, payload: Record<string, unknown>) {
        this.appended.push({ userId, type, payload });
    }
}

class NoopMetrics implements RaceFinishedEmitter, AntiCheatMetrics {
    flagged: string[] = [];
    finished: number[] = [];
    onFlag(code: string) {
        this.flagged.push(code);
    }
    emitRaceFinished(_roomId: string, _ts: number, durationMs: number) {
        this.finished.push(durationMs);
    }
}

const NoopTeamRooms: TeamRoomReader = { listTeams: async () => [] };
const NoopTeamRatings: TeamRatingApplier = {
    getOrInit: async () => ({ rating: 1000 }),
    buildApplyItems: () => [],
    sendTransaction: async () => { },
};

function makeHandler(opts?: {
    rooms?: InMemoryRoomRepo;
    snippets?: InMemorySnippetRepo;
    users?: FakeUsers;
    feed?: FakeFeed;
    broadcaster?: FakeBroadcaster;
    metrics?: NoopMetrics;
    connections?: InMemoryConnectionRepo;
}) {
    const rooms = opts?.rooms ?? new InMemoryRoomRepo();
    const connections = opts?.connections ?? new InMemoryConnectionRepo();
    const snippets =
        opts?.snippets ??
        new InMemorySnippetRepo().addMeta({
            snippet_id: "s1",
            language: "ts",
            length: 100,
        });
    const users = opts?.users ?? new FakeUsers();
    const feed = opts?.feed ?? new FakeFeed();
    const broadcaster = opts?.broadcaster ?? new FakeBroadcaster();
    const metrics = opts?.metrics ?? new NoopMetrics();
    const handler = new FinishRaceHandler(
        rooms,
        connections,
        snippets,
        users,
        NoopTeamRooms,
        NoopTeamRatings,
        feed,
        broadcaster,
        new FakeClock(2_000_000_000_000),
        metrics,
        () => [],
    );
    return { rooms, connections, snippets, users, feed, broadcaster, metrics, handler };
}

function seedLobbyRoomStarted(rooms: InMemoryRoomRepo) {
    rooms.snapshots.set("r1", {
        room_id: "r1",
        code: "ABC123",
        host_id: "u1",
        snippet_id: "s1",
        status: "racing",
        created_at: 0,
        version: 1,
        started_at: 1_999_999_990_000,
    });
}

describe("FinishRaceCommand", () => {
    test("404 when connection unknown", async () => {
        const { handler } = makeHandler();
        await expect(
            handler.execute(
                new FinishRaceCommand({
                    connectionId: "ghost",
                    chars_typed: 100,
                    errors: 0,
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("forbidden for spectators", async () => {
        const { rooms, connections, handler } = makeHandler();
        seedLobbyRoomStarted(rooms);
        await connections.put("r1", "c1", "spec", "spectator", {});
        await expect(
            handler.execute(
                new FinishRaceCommand({
                    connectionId: "c1",
                    chars_typed: 100,
                    errors: 0,
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("rejects when chars_typed < snippet.length", async () => {
        const { rooms, connections, handler } = makeHandler();
        seedLobbyRoomStarted(rooms);
        await connections.put("r1", "c1", "alice", "racer", {});
        await expect(
            handler.execute(
                new FinishRaceCommand({
                    connectionId: "c1",
                    chars_typed: 50,
                    errors: 0,
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("solo path: records finish + applies elo + broadcasts when all done", async () => {
        const rooms = new InMemoryRoomRepo();
        seedLobbyRoomStarted(rooms);
        rooms.players.set("r1", [
            {
                user_id: "u1",
                display_name: "alice",
                joined_at: 0,
                chars_typed: 0,
                errors: 0,
                progress: 0,
            },
            {
                // already-finished bob
                user_id: "u2",
                display_name: "bob",
                joined_at: 0,
                chars_typed: 100,
                errors: 1,
                progress: 1,
                // @ts-expect-error legacy extra fields
                finished_at: 1_999_999_995_000,
                scaled_wpm: 80,
                net_wpm: 75,
                gross_wpm: 78,
                accuracy: 99,
            },
        ]);
        const connections = new InMemoryConnectionRepo();
        await connections.put("r1", "c1", "alice", "racer", {});
        await connections.put("r1", "c2", "bob", "racer", {});
        const users = new FakeUsers().seed("u1", 1000).seed("u2", 1000);
        const { handler, broadcaster, feed } = makeHandler({
            rooms,
            connections,
            users,
        });
        await handler.execute(
            new FinishRaceCommand({
                connectionId: "c1",
                chars_typed: 100,
                errors: 0,
            }),
        );
        // Alice's finish recorded
        expect(rooms.finishes).toHaveLength(1);
        expect(rooms.finishes[0].displayName).toBe("alice");
        // applyRaceResults called once with both rated participants
        expect(users.applyCalls).toHaveLength(1);
        expect(users.applyCalls[0].participants.map((p) => p.userId).sort()).toEqual(
            ["u1", "u2"],
        );
        // Two peers received "ratings" broadcast
        const ratings = broadcaster.sent.filter(
            (s) => (s.payload as { type: string }).type === "ratings",
        );
        expect(ratings).toHaveLength(2);
        // Feed appended for both finishers
        expect(feed.appended.map((a) => a.userId).sort()).toEqual(["u1", "u2"]);
    });

    test("flagged race skips elo (only records the finish)", async () => {
        // To force a flag, make the elapsed time absurdly short.
        const rooms = new InMemoryRoomRepo();
        rooms.snapshots.set("r1", {
            room_id: "r1",
            code: "ABC123",
            host_id: "u1",
            snippet_id: "s1",
            status: "racing",
            created_at: 0,
            version: 1,
            started_at: 1_999_999_999_999,
        });
        const connections = new InMemoryConnectionRepo();
        await connections.put("r1", "c1", "alice", "racer", {});
        const users = new FakeUsers();
        const { handler } = makeHandler({ rooms, connections, users });
        await handler.execute(
            new FinishRaceCommand({
                connectionId: "c1",
                chars_typed: 100,
                errors: 0,
            }),
        );
        expect(rooms.finishes).toHaveLength(1);
        // Anti-cheat tripped → elo skipped
        expect(users.applyCalls).toHaveLength(0);
    });
});
