import { describe, expect, test } from "bun:test";
import { DomainError } from "@codetype/domain";
import {
    CommandBus,
    CreateRoomCommand,
    CreateRoomHandler,
} from "../../src";
import {
    FakeClock,
    FakeRandom,
    InMemoryRoomRepo,
    InMemorySnippetRepo,
} from "../fakes";

function setup() {
    const rooms = new InMemoryRoomRepo();
    const snippets = new InMemorySnippetRepo().add("s1");
    const clock = new FakeClock();
    const random = new FakeRandom()
        .queueUuid("11111111-1111-7111-8111-111111111111")
        .queueCode("ABC123");
    const handler = new CreateRoomHandler(rooms, snippets, clock, random);
    const bus = new CommandBus().register(CreateRoomCommand, handler);
    return { rooms, snippets, clock, random, bus };
}

describe("CreateRoomCommand", () => {
    test("happy path: dispatch returns room_id + code", async () => {
        const { bus, rooms } = setup();
        const result = await bus.dispatch(
            new CreateRoomCommand({ hostId: "u1", snippetId: "s1" }),
        );
        expect(result.code).toBe("ABC123");
        expect(result.room_id).toBe("11111111-1111-7111-8111-111111111111");
        const stored = rooms.snapshots.get(result.room_id)!;
        expect(stored.host_id).toBe("u1");
        expect(stored.snippet_id).toBe("s1");
        expect(stored.status).toBe("lobby");
    });

    test("fails when snippet not found", async () => {
        const { bus } = setup();
        await expect(
            bus.dispatch(
                new CreateRoomCommand({ hostId: "u1", snippetId: "missing" }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("filters mode: picks via snippets.random", async () => {
        const rooms = new InMemoryRoomRepo();
        const snippets = new InMemorySnippetRepo().queueRandom({ snippet_id: "rnd" });
        const random = new FakeRandom()
            .queueUuid("22222222-2222-7222-8222-222222222222")
            .queueCode("XYZ789");
        const handler = new CreateRoomHandler(
            rooms,
            snippets,
            new FakeClock(),
            random,
        );
        const bus = new CommandBus().register(CreateRoomCommand, handler);
        const result = await bus.dispatch(
            new CreateRoomCommand({
                hostId: "u1",
                filters: { language: "ts" },
            }),
        );
        expect(rooms.snapshots.get(result.room_id)!.snippet_id).toBe("rnd");
    });

    test("retries up to 5 times on code collision", async () => {
        const rooms = new InMemoryRoomRepo();
        rooms.byCode.set("DUP001", "preexisting");
        rooms.byCode.set("DUP002", "preexisting");
        const snippets = new InMemorySnippetRepo().add("s1");
        const random = new FakeRandom()
            .queueUuid("33333333-3333-7333-8333-333333333333")
            .queueCode("DUP001", "DUP002", "FRESH1");
        const handler = new CreateRoomHandler(
            rooms,
            snippets,
            new FakeClock(),
            random,
        );
        const result = await handler.execute(
            new CreateRoomCommand({ hostId: "u1", snippetId: "s1" }),
        );
        expect(result.code).toBe("FRESH1");
    });

    test("rematch reuses snippet and seeds non-DNF players", async () => {
        const rooms = new InMemoryRoomRepo();
        rooms.snapshots.set("prev-room", {
            room_id: "prev-room",
            code: "OLD123",
            host_id: "u1",
            snippet_id: "s1",
            status: "finished",
            created_at: 0,
            version: 0,
        });
        rooms.byCode.set("OLD123", "prev-room");
        rooms.players.set("prev-room", [
            {
                user_id: "u1",
                display_name: "host",
                joined_at: 1,
                chars_typed: 100,
                errors: 1,
                progress: 1,
            },
            // DNF — should NOT be seeded
            {
                user_id: "u2",
                display_name: "rage-quit",
                joined_at: 2,
                chars_typed: 0,
                errors: 0,
                progress: 0,
                // @ts-expect-error extra field on legacy seed shape
                is_dnf: true,
            },
        ]);
        const snippets = new InMemorySnippetRepo().add("s1");
        const random = new FakeRandom()
            .queueUuid("44444444-4444-7444-8444-444444444444")
            .queueCode("NEW123");
        const handler = new CreateRoomHandler(
            rooms,
            snippets,
            new FakeClock(2_000_000_000_000),
            random,
        );
        const result = await handler.execute(
            new CreateRoomCommand({
                hostId: "u1",
                previousRoomId: "prev-room",
            }),
        );
        const seeded = rooms.players.get(result.room_id)!;
        expect(seeded).toHaveLength(1);
        expect(seeded[0].user_id).toBe("u1");
        expect(seeded[0].joined_at).toBe(2_000_000_000_000);
    });
});
