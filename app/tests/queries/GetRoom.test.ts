import { describe, expect, test } from "bun:test";
import { DomainError } from "@codetype/domain";
import { GetRoomHandler, GetRoomQuery, QueryBus } from "../../src";
import { InMemoryRoomRepo } from "../fakes";

function setup() {
    const rooms = new InMemoryRoomRepo();
    rooms.snapshots.set("r1", {
        room_id: "r1",
        code: "ABC123",
        host_id: "u1",
        snippet_id: "s1",
        status: "lobby",
        created_at: 1,
        version: 0,
    });
    rooms.byCode.set("ABC123", "r1");
    const bus = new QueryBus().register(
        GetRoomQuery,
        new GetRoomHandler(rooms),
    );
    return { bus, rooms };
}

describe("GetRoomQuery", () => {
    test("returns the projection when found", async () => {
        const { bus } = setup();
        const out = await bus.execute(new GetRoomQuery("ABC123"));
        expect(out.room_id).toBe("r1");
        expect(out.snippet_id).toBe("s1");
        expect(out.status).toBe("lobby");
    });

    test("throws DomainError on missing", async () => {
        const { bus } = setup();
        await expect(bus.execute(new GetRoomQuery("NOPE99"))).rejects.toBeInstanceOf(
            DomainError,
        );
    });
});
