import type { z } from "zod";
import type { WsFinishSchema } from "@codetype/shared/schemas";
import { accuracy, grossWpm, netWpm, scaledWpm } from "@codetype/shared/wpm";
import { Errors } from "../src/AppError";
import { connections } from "../src/repos/ConnectionRepo";
import { rooms } from "../src/repos/RoomRepo";
import { snippets } from "../src/repos/SnippetRepo";

type FinishMsg = z.infer<typeof WsFinishSchema>;

export async function applyFinish(
  input: FinishMsg,
  connectionId: string,
): Promise<void> {
  const conn = await connections.byConnectionId(connectionId);
  if (!conn) throw Errors.NotFound("connection");
  if ((conn.role ?? "racer") === "spectator") {
    throw Errors.Forbidden();
  }
  const roomId = conn.PK.slice("ROOM#".length);
  const displayName = conn.display_name;

  const room = await rooms.getMeta(roomId);
  if (!room?.started_at) throw Errors.Conflict("not started");

  const snippet = await snippets.getById(room.snippet_id);
  if (!snippet) throw Errors.NotFound("snippet");
  if (input.chars_typed < snippet.length) {
    throw Errors.BadRequest("incomplete");
  }

  const finishedAt = Date.now();
  const elapsedMs = finishedAt - room.started_at;
  const gross = grossWpm(input.chars_typed, elapsedMs);
  const net = netWpm(input.chars_typed, input.errors, elapsedMs);
  const acc = accuracy(input.chars_typed, input.errors);
  const scaled = scaledWpm(input.chars_typed, input.errors, elapsedMs);

  await rooms.recordFinish({
    roomId,
    hostId: room.host_id,
    displayName,
    finishedAt,
    charsTyped: input.chars_typed,
    errors: input.errors,
    grossWpm: gross,
    netWpm: net,
    accuracy: acc,
    scaledWpm: scaled,
  });
}
