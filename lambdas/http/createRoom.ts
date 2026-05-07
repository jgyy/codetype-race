import { v7 as uuidv7 } from "uuid";
import { generateRoomCode } from "@codetype/shared/ddb-keys";
import {
  CreateRoomRequestSchema,
  CreateRoomResponseSchema,
  type Room,
} from "@codetype/shared/schemas";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { rooms } from "../src/repos/RoomRepo";
import { snippets } from "../src/repos/SnippetRepo";

const MAX_CODE_TRIES = 5;

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < MAX_CODE_TRIES; i++) {
    const code = generateRoomCode();
    if (!(await rooms.isCodeTaken(code))) return code;
  }
  throw Errors.Internal("could not allocate unique room code");
}

export const handler = withHttp(
  CreateRoomRequestSchema,
  async (input, ctx) => {
    if (!ctx.userId) throw Errors.Unauthorized();

    const snippet = await snippets.getById(input.snippet_id);
    if (!snippet) throw Errors.NotFound("snippet");

    const room: Room = {
      room_id: uuidv7(),
      code: await uniqueCode(),
      host_id: ctx.userId,
      snippet_id: input.snippet_id,
      status: "lobby",
      created_at: Date.now(),
      version: 0,
    };
    await rooms.create(room);

    return CreateRoomResponseSchema.parse({
      room_id: room.room_id,
      code: room.code,
    });
  },
);
