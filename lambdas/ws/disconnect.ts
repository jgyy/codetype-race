import { withWsLifecycle } from "../src/middleware";
import { connections } from "../src/repos/ConnectionRepo";
import { rooms } from "../src/repos/RoomRepo";

export const handler = withWsLifecycle(async (_event, ctx) => {
  const conn = await connections.byConnectionId(ctx.connectionId);
  if (!conn) return { statusCode: 200, body: "noop" };

  await connections.delete(conn.PK, conn.SK);
  const roomId = conn.PK.slice("ROOM#".length);
  await rooms.markPlayerDnf(roomId, conn.display_name);
  return { statusCode: 200, body: "ok" };
});
