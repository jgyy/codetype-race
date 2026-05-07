import {
    JoinRoomRequestSchema,
    JoinRoomResponseSchema,
} from "@codetype/shared/schemas";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { rooms } from "../src/repos/RoomRepo";

const MAX_RACERS = 8;

export const handler = withHttp(JoinRoomRequestSchema, async (input) => {
    const room = await rooms.getByCode(input.code);
    if (!room) throw Errors.NotFound("room");
    if (room.status !== "lobby") throw Errors.Conflict("room not joinable");

    if (input.role === "racer") {
        const existing = await rooms.listPlayers(room.room_id);
        const racerCount = existing.filter(
            (p) => (p.role ?? "racer") === "racer",
        ).length;
        if (racerCount >= MAX_RACERS) throw Errors.Conflict("room full");
    }

    await rooms.addPlayer(room.room_id, {
        display_name: input.display_name,
        joined_at: Date.now(),
        chars_typed: 0,
        errors: 0,
        progress: 0,
        role: input.role,
    });

    return JoinRoomResponseSchema.parse({
        room_id: room.room_id,
        snippet_id: room.snippet_id,
        status: room.status,
    });
});
