import type { z } from "zod";
import type { WsChatSchema } from "@codetype/shared/schemas";
import { Errors } from "../src/AppError";
import { connections } from "../src/repos/ConnectionRepo";
import { rooms } from "../src/repos/RoomRepo";
import { postTo } from "../src/wsClient";

type ChatMsg = z.infer<typeof WsChatSchema>;

export async function applyChat(
    input: ChatMsg,
    connectionId: string,
): Promise<void> {
    const conn = await connections.byConnectionId(connectionId);
    if (!conn) throw Errors.NotFound("connection");
    const roomId = conn.PK.slice("ROOM#".length);

    const room = await rooms.getMeta(roomId);
    if (!room) throw Errors.NotFound("room");
    if (room.status !== "lobby" && room.status !== "finished") {
        throw Errors.Conflict("chat closed");
    }

    await connections.consumeChatToken(roomId, connectionId);

    const payload = {
        type: "chat" as const,
        display_name: conn.display_name,
        text: input.text,
        ts: Date.now(),
    };
    const conns = await connections.listByRoom(roomId);
    await Promise.all(conns.map((id) => postTo(id, payload).catch(() => false)));
}
