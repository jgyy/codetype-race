// src/ws-helpers.ts
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

// src/ddb.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
var client = new DynamoDBClient({});
var ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});
var TABLE = process.env.TABLE_NAME;

// src/shared/ddb-keys.ts
var roomPK = (roomId) => `ROOM#${roomId}`;

// src/ws-helpers.ts
async function listConnectionsInRoom(roomId) {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": roomPK(roomId), ":sk": "CONN#" }
    })
  );
  return (r.Items ?? []).map((i) => i.connection_id);
}

// src/wsClient.ts
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException
} from "@aws-sdk/client-apigatewaymanagementapi";
var endpoint = process.env.WS_ENDPOINT;
var wsClient = endpoint ? new ApiGatewayManagementApiClient({ endpoint }) : null;
async function postTo(connectionId, payload) {
  if (!wsClient) throw new Error("WS_ENDPOINT not set");
  try {
    await wsClient.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(payload))
      })
    );
    return true;
  } catch (e) {
    if (e instanceof GoneException) return false;
    throw e;
  }
}

// stream/broadcast.ts
function parseRecord(record) {
  const keys = record.dynamodb?.Keys;
  const newImg = record.dynamodb?.NewImage;
  const oldImg = record.dynamodb?.OldImage;
  const pk = keys?.PK?.S;
  const sk = keys?.SK?.S;
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
            started_at: newImg.started_at?.N ? Number(newImg.started_at.N) : void 0
          }
        }
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
          payload: { display_name: newImg?.display_name?.S }
        }
      };
    }
    if (record.eventName === "REMOVE") {
      return {
        roomId,
        payload: {
          type: "room-event",
          event: "leave",
          payload: { display_name: oldImg?.display_name?.S }
        }
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
          finished_at: Number(newImg.finished_at.N)
        }
      };
    }
  }
  return null;
}
var handler = async (event) => {
  const events = event.Records.map(parseRecord).filter(
    (e) => e !== null
  );
  if (events.length === 0) return;
  const byRoom = /* @__PURE__ */ new Map();
  for (const e of events) {
    if (!byRoom.has(e.roomId)) byRoom.set(e.roomId, []);
    byRoom.get(e.roomId).push(e.payload);
  }
  await Promise.all(
    Array.from(byRoom.entries()).map(async ([roomId, payloads]) => {
      const conns = await listConnectionsInRoom(roomId);
      await Promise.all(
        conns.flatMap(
          (id) => payloads.map((p) => postTo(id, p).catch(() => false))
        )
      );
    })
  );
};
export {
  handler
};
