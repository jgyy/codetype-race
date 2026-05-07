import { Errors } from "../src/AppError";
import { connections } from "../src/repos/ConnectionRepo";

export async function applyHeartbeat(connectionId: string): Promise<void> {
  const conn = await connections.byConnectionId(connectionId);
  if (!conn) throw Errors.NotFound("connection");
  const roomId = conn.PK.slice("ROOM#".length);
  await connections.touch(roomId, connectionId);
}
