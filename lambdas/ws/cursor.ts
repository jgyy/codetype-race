import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "../src/ddb";
import { playerSK, roomPK } from "../src/shared/ddb-keys";
import { listConnectionsInRoom, resolveConnection } from "../src/ws-helpers";
import { postTo } from "../src/wsClient";

interface PendingState {
  progress: number;
  chars_typed: number;
  errors: number;
}

// Lambda execution-context reuse: collapse rapid cursor updates into a
// single fan-out within a 100ms window per connection. See plan §
// "Throttling & coalescing".
const pending = new Map<string, PendingState>();
const COALESCE_MS = 100;
let flushScheduled = false;

async function flush() {
  flushScheduled = false;
  const snapshot = new Map(pending);
  pending.clear();

  await Promise.all(
    Array.from(snapshot.entries()).map(async ([connectionId, state]) => {
      const ctx = await resolveConnection(connectionId);
      if (!ctx) return;
      const { roomId, displayName } = ctx;

      await ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { PK: roomPK(roomId), SK: playerSK(displayName) },
          UpdateExpression:
            "SET progress = :p, chars_typed = :c, errors = :e",
          ExpressionAttributeValues: {
            ":p": state.progress,
            ":c": state.chars_typed,
            ":e": state.errors,
          },
        }),
      );

      const peers = await listConnectionsInRoom(roomId);
      const payload = {
        type: "cursor" as const,
        display_name: displayName,
        progress: state.progress,
      };
      const sends = peers
        .filter((id) => id !== connectionId)
        .map((id) => postTo(id, payload).catch(() => false));
      // bound parallelism — small N (max 7 peers), no batching needed
      await Promise.all(sends);
    }),
  );
}

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  let msg: any;
  try {
    msg = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: "bad json" };
  }
  if (msg.action !== "cursor") return { statusCode: 400, body: "wrong action" };

  pending.set(connectionId, {
    progress: Math.max(0, Math.min(1, Number(msg.progress) || 0)),
    chars_typed: Number(msg.chars_typed) | 0,
    errors: Math.max(0, Number(msg.errors) | 0),
  });

  if (!flushScheduled) {
    flushScheduled = true;
    setTimeout(flush, COALESCE_MS);
  }

  return { statusCode: 200, body: "ok" };
};
