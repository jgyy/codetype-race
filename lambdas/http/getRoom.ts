import { z } from "zod";
import {
  GetRoomResponseSchema,
  RoomCodeSchema,
} from "@codetype/shared/schemas";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { rooms } from "../src/repos/RoomRepo";

// `getRoom` reads its argument from the path; withHttp validates the body,
// but the route's body is empty. We accept an empty object body and pull
// the path param from ctx.
const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
  const code = RoomCodeSchema.parse(ctx.pathParameters.code ?? "");
  const room = await rooms.getByCode(code);
  if (!room) throw Errors.NotFound("room");

  return GetRoomResponseSchema.parse({
    room_id: room.room_id,
    code: room.code,
    snippet_id: room.snippet_id,
    status: room.status,
    started_at: room.started_at,
  });
});
