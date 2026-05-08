import { describe, expect, test } from "bun:test";
import { DomainError } from "@codetype/domain";
import { JoinRoomCommand, JoinRoomHandler } from "../../src";
import { FakeClock, InMemoryRoomRepo } from "../fakes";

function seedLobby(rooms: InMemoryRoomRepo) {
    rooms.snapshots.set("r1", {
        room_id: "r1",
        code: "ABC123",
        host_id: "u1",
        snippet_id: "s1",
        status: "lobby",
        created_at: 0,
        version: 0,
    });
    rooms.byCode.set("ABC123", "r1");
}

describe("JoinRoomCommand", () => {
    test("404 when room missing", async () => {
        const handler = new JoinRoomHandler(new InMemoryRoomRepo(), new FakeClock());
        await expect(
            handler.execute(
                new JoinRoomCommand({ code: "MISS01", displayName: "x", role: "racer" }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("409 when room not in lobby", async () => {
        const rooms = new InMemoryRoomRepo();
        seedLobby(rooms);
        const snap = rooms.snapshots.get("r1")!;
        rooms.snapshots.set("r1", { ...snap, status: "racing" });
        const handler = new JoinRoomHandler(rooms, new FakeClock());
        await expect(
            handler.execute(
                new JoinRoomCommand({ code: "ABC123", displayName: "x", role: "racer" }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("409 when racer slot is full (8)", async () => {
        const rooms = new InMemoryRoomRepo();
        seedLobby(rooms);
        const eight = Array.from({ length: 8 }, (_, i) => ({
            display_name: `r${i}`,
            joined_at: 0,
            chars_typed: 0,
            errors: 0,
            progress: 0,
            role: "racer" as const,
        }));
        rooms.players.set("r1", eight);
        const handler = new JoinRoomHandler(rooms, new FakeClock());
        await expect(
            handler.execute(
                new JoinRoomCommand({ code: "ABC123", displayName: "ninth", role: "racer" }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("spectators are exempt from racer cap", async () => {
        const rooms = new InMemoryRoomRepo();
        seedLobby(rooms);
        rooms.players.set(
            "r1",
            Array.from({ length: 8 }, (_, i) => ({
                display_name: `r${i}`,
                joined_at: 0,
                chars_typed: 0,
                errors: 0,
                progress: 0,
                role: "racer" as const,
            })),
        );
        const handler = new JoinRoomHandler(rooms, new FakeClock());
        const out = await handler.execute(
            new JoinRoomCommand({
                code: "ABC123",
                displayName: "watcher",
                role: "spectator",
            }),
        );
        expect(out.room_id).toBe("r1");
        expect(rooms.players.get("r1")!.length).toBe(9);
    });

    test("happy path returns the room projection", async () => {
        const rooms = new InMemoryRoomRepo();
        seedLobby(rooms);
        const handler = new JoinRoomHandler(rooms, new FakeClock());
        const out = await handler.execute(
            new JoinRoomCommand({ code: "ABC123", displayName: "alice", role: "racer" }),
        );
        expect(out).toEqual({ room_id: "r1", snippet_id: "s1", status: "lobby" });
        expect(rooms.players.get("r1")![0].display_name).toBe("alice");
    });
});
