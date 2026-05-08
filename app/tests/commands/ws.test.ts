import { describe, expect, test } from "bun:test";
import { DomainError } from "@codetype/domain";
import {
    ConnectToRoomCommand,
    ConnectToRoomHandler,
    DisconnectFromRoomCommand,
    DisconnectFromRoomHandler,
    HeartbeatCommand,
    HeartbeatHandler,
    SendChatCommand,
    SendChatHandler,
    StartCountdownCommand,
    StartCountdownHandler,
} from "../../src";
import {
    FakeBroadcaster,
    FakeClock,
    InMemoryConnectionRepo,
    InMemoryRoomRepo,
} from "../fakes";

function seedRoom(rooms: InMemoryRoomRepo, status: "lobby" | "racing" | "finished" = "lobby") {
    rooms.snapshots.set("r1", {
        room_id: "r1",
        code: "ABC123",
        host_id: "u1",
        snippet_id: "s1",
        status,
        created_at: 1,
        version: 0,
    });
    rooms.byCode.set("ABC123", "r1");
}

describe("ConnectToRoomCommand", () => {
    test("404 when room missing", async () => {
        const handler = new ConnectToRoomHandler(
            new InMemoryRoomRepo(),
            new InMemoryConnectionRepo(),
        );
        await expect(
            handler.execute(
                new ConnectToRoomCommand({
                    connectionId: "c1",
                    code: "MISS01",
                    displayName: "alice",
                    role: "racer",
                    cursorLite: false,
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("inserts a connection row keyed by ROOM#room_id", async () => {
        const rooms = new InMemoryRoomRepo();
        seedRoom(rooms);
        const conns = new InMemoryConnectionRepo();
        await new ConnectToRoomHandler(rooms, conns).execute(
            new ConnectToRoomCommand({
                connectionId: "c1",
                code: "ABC123",
                displayName: "alice",
                role: "spectator",
                cursorLite: true,
            }),
        );
        const row = conns.rows.get("c1")!;
        expect(row.PK).toBe("ROOM#r1");
        expect(row.role).toBe("spectator");
        expect(row.cursor_lite).toBe(true);
    });
});

describe("DisconnectFromRoomCommand", () => {
    test("noop when connection unknown", async () => {
        const out = await new DisconnectFromRoomHandler(
            new InMemoryRoomRepo(),
            new InMemoryConnectionRepo(),
        ).execute(new DisconnectFromRoomCommand({ connectionId: "ghost" }));
        expect(out.applied).toBe(false);
    });

    test("removes connection and DNFs the player", async () => {
        const rooms = new InMemoryRoomRepo();
        seedRoom(rooms);
        const conns = new InMemoryConnectionRepo();
        await conns.put("r1", "c1", "alice", "racer", {});
        const out = await new DisconnectFromRoomHandler(rooms, conns).execute(
            new DisconnectFromRoomCommand({ connectionId: "c1" }),
        );
        expect(out.applied).toBe(true);
        expect(conns.rows.has("c1")).toBe(false);
        expect(rooms.dnf).toEqual([{ roomId: "r1", displayName: "alice" }]);
    });
});

describe("StartCountdownCommand", () => {
    test("404 if connection unknown", async () => {
        await expect(
            new StartCountdownHandler(
                new InMemoryRoomRepo(),
                new InMemoryConnectionRepo(),
                new FakeClock(),
            ).execute(new StartCountdownCommand({ connectionId: "x" })),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("transitions room to countdown with started_at = now + 3000", async () => {
        const rooms = new InMemoryRoomRepo();
        seedRoom(rooms);
        const conns = new InMemoryConnectionRepo();
        await conns.put("r1", "c1", "host", "racer", {});
        const clock = new FakeClock(2_000_000_000_000);
        await new StartCountdownHandler(rooms, conns, clock).execute(
            new StartCountdownCommand({ connectionId: "c1" }),
        );
        const snap = rooms.snapshots.get("r1")!;
        expect(snap.status).toBe("countdown");
        expect(snap.started_at).toBe(2_000_000_000_000 + 3000);
    });
});

describe("HeartbeatCommand", () => {
    test("touches the connection row", async () => {
        const conns = new InMemoryConnectionRepo();
        await conns.put("r1", "c1", "alice", "racer", {});
        await new HeartbeatHandler(conns).execute(
            new HeartbeatCommand({ connectionId: "c1" }),
        );
        expect(conns.touched).toEqual([{ roomId: "r1", connectionId: "c1" }]);
    });
});

describe("SendChatCommand", () => {
    function setup(status: "lobby" | "racing" | "finished" = "lobby") {
        const rooms = new InMemoryRoomRepo();
        seedRoom(rooms, status);
        const conns = new InMemoryConnectionRepo();
        const broadcaster = new FakeBroadcaster();
        const clock = new FakeClock(1_700_000_000_000);
        const handler = new SendChatHandler(rooms, conns, broadcaster, clock);
        return { rooms, conns, broadcaster, clock, handler };
    }

    test("rejects when status is racing", async () => {
        const { conns, handler } = setup("racing");
        await conns.put("r1", "c1", "alice", "racer", {});
        await expect(
            handler.execute(new SendChatCommand({ connectionId: "c1", text: "hi" })),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("broadcasts to all peers in lobby", async () => {
        const { conns, broadcaster, handler } = setup("lobby");
        await conns.put("r1", "c1", "alice", "racer", {});
        await conns.put("r1", "c2", "bob", "racer", {});
        await handler.execute(
            new SendChatCommand({ connectionId: "c1", text: "hello" }),
        );
        expect(broadcaster.sent).toHaveLength(2);
        const ids = broadcaster.sent.map((s) => s.connectionId).sort();
        expect(ids).toEqual(["c1", "c2"]);
        expect(broadcaster.sent[0].payload).toMatchObject({
            type: "chat",
            display_name: "alice",
            text: "hello",
            ts: 1_700_000_000_000,
        });
    });
});
