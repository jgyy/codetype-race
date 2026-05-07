import { WsConnectQuerySchema } from "@codetype/shared/schemas";
import { withWsLifecycle } from "../src/middleware";
import { Errors } from "../src/AppError";
import { rooms } from "../src/repos/RoomRepo";
import { connections } from "../src/repos/ConnectionRepo";

export const handler = withWsLifecycle(async (event, ctx) => {
  const qs = (event as unknown as { queryStringParameters?: Record<string, string> })
    .queryStringParameters ?? {};
  const parsed = WsConnectQuerySchema.parse(qs);

  const room = await rooms.getByCode(parsed.code);
  if (!room) throw Errors.NotFound("room");

  await connections.put(
    room.room_id,
    ctx.connectionId,
    parsed.display_name,
    parsed.role,
  );
  return { statusCode: 200, body: "connected" };
});
