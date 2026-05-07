import type { DynamoDBStreamHandler } from "aws-lambda";
import { withStream } from "../src/middleware";
import { connections } from "../src/repos/ConnectionRepo";
import { postTo } from "../src/wsClient";

interface RoomEvent {
  roomId: string;
  payload: unknown;
}

function parseRecord(record: any): RoomEvent | null {
  const keys = record.dynamodb?.Keys;
  const newImg = record.dynamodb?.NewImage;
  const oldImg = record.dynamodb?.OldImage;
  const pk: string | undefined = keys?.PK?.S;
  const sk: string | undefined = keys?.SK?.S;
  if (!pk?.startsWith("ROOM#")) return null;
  const roomId = pk.slice("ROOM#".length);

  if (sk === "META" && newImg?.status?.S) {
    const oldStatus = oldImg?.status?.S;
    const newStatus = newImg.status.S;
    if (oldStatus !== newStatus) {
      return {
        roomId,
        payload: {
          type: "room-event",
          event: "status",
          payload: {
            status: newStatus,
            started_at: newImg.started_at?.N
              ? Number(newImg.started_at.N)
              : undefined,
          },
        },
      };
    }
  }

  if (sk?.startsWith("PLAYER#")) {
    if (record.eventName === "INSERT") {
      return {
        roomId,
        payload: {
          type: "room-event",
          event: "join",
          payload: { display_name: newImg?.display_name?.S },
        },
      };
    }
    if (record.eventName === "REMOVE") {
      return {
        roomId,
        payload: {
          type: "room-event",
          event: "leave",
          payload: { display_name: oldImg?.display_name?.S },
        },
      };
    }
    if (newImg?.finished_at?.N) {
      return {
        roomId,
        payload: {
          type: "finish",
          display_name: newImg.display_name?.S,
          gross_wpm: Number(newImg.gross_wpm?.N ?? 0),
          net_wpm: Number(newImg.net_wpm?.N ?? 0),
          accuracy: Number(newImg.accuracy?.N ?? 0),
          scaled_wpm: Number(newImg.scaled_wpm?.N ?? 0),
          finished_at: Number(newImg.finished_at.N),
        },
      };
    }
  }

  return null;
}

export const handler: DynamoDBStreamHandler = withStream(async (event) => {
  const events = event.Records.map(parseRecord).filter(
    (e): e is RoomEvent => e !== null,
  );
  if (events.length === 0) return;

  const byRoom = new Map<string, unknown[]>();
  for (const e of events) {
    if (!byRoom.has(e.roomId)) byRoom.set(e.roomId, []);
    byRoom.get(e.roomId)!.push(e.payload);
  }

  await Promise.all(
    Array.from(byRoom.entries()).map(async ([roomId, payloads]) => {
      const conns = await connections.listByRoom(roomId);
      await Promise.all(
        conns.flatMap((id) =>
          payloads.map((p) => postTo(id, p).catch(() => false)),
        ),
      );
    }),
  );
});
