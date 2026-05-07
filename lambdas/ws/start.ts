import { Errors } from "../src/AppError";
import { connections } from "../src/repos/ConnectionRepo";
import { rooms } from "../src/repos/RoomRepo";

const COUNTDOWN_MS = 3000;

export async function applyStart(connectionId: string): Promise<void> {
    const conn = await connections.byConnectionId(connectionId);
    if (!conn) throw Errors.NotFound("connection");
    const roomId = conn.PK.slice("ROOM#".length);

    const room = await rooms.getMeta(roomId);
    if (!room) throw Errors.NotFound("room");

    const startedAt = Date.now() + COUNTDOWN_MS;
    await rooms.startCountdown(roomId, startedAt);
}
