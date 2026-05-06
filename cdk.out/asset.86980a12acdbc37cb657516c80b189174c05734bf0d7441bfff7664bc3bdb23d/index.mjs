// ws/cursor.ts
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";

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
var roomMetaSK = () => "META";
var playerSK = (displayName) => `PLAYER#${displayName}`;
var connSK = (connectionId) => `CONN#${connectionId}`;
var resultSK = (finishedAt, displayName) => `RESULT#${finishedAt}#${displayName}`;
var snippetPK = (snippetId) => `SNIPPET#${snippetId}`;
var connGSI1PK = (connectionId) => `CONN#${connectionId}`;
var hostGSI1PK = (hostId) => `HOST#${hostId}`;
var finishedGSI1SK = (finishedAt) => `FINISHED#${finishedAt}`;

// src/ws-helpers.ts
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
async function resolveConnection(connectionId) {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": connGSI1PK(connectionId) },
      Limit: 1
    })
  );
  const c = r.Items?.[0];
  if (!c) return null;
  return {
    roomId: c.PK.slice("ROOM#".length),
    displayName: c.display_name
  };
}
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

// ws/cursor.ts
var pending = /* @__PURE__ */ new Map();
var COALESCE_MS = 100;
var flushScheduled = false;
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
          UpdateExpression: "SET progress = :p, chars_typed = :c, errors = :e",
          ExpressionAttributeValues: {
            ":p": state.progress,
            ":c": state.chars_typed,
            ":e": state.errors
          }
        })
      );
      const peers = await listConnectionsInRoom(roomId);
      const payload = {
        type: "cursor",
        display_name: displayName,
        progress: state.progress
      };
      const sends = peers.filter((id) => id !== connectionId).map((id) => postTo(id, payload).catch(() => false));
      await Promise.all(sends);
    })
  );
}
var handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  let msg;
  try {
    msg = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: "bad json" };
  }
  if (msg.action !== "cursor") return { statusCode: 400, body: "wrong action" };
  pending.set(connectionId, {
    progress: Math.max(0, Math.min(1, Number(msg.progress) || 0)),
    chars_typed: Number(msg.chars_typed) | 0,
    errors: Math.max(0, Number(msg.errors) | 0)
  });
  if (!flushScheduled) {
    flushScheduled = true;
    setTimeout(flush, COALESCE_MS);
  }
  return { statusCode: 200, body: "ok" };
};

// ws/heartbeat.ts
import { UpdateCommand as UpdateCommand2 } from "@aws-sdk/lib-dynamodb";
var TTL_SECONDS = 30;
var handler2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const ctx = await resolveConnection(connectionId);
  if (!ctx) return { statusCode: 404, body: "no conn" };
  await ddb.send(
    new UpdateCommand2({
      TableName: TABLE,
      Key: {
        PK: `ROOM#${ctx.roomId}`,
        SK: connSK(connectionId)
      },
      UpdateExpression: "SET #ttl = :t",
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: {
        ":t": Math.floor(Date.now() / 1e3) + TTL_SECONDS
      }
    })
  );
  return { statusCode: 200, body: "pong" };
};

// ws/start.ts
import { GetCommand, UpdateCommand as UpdateCommand3 } from "@aws-sdk/lib-dynamodb";
var COUNTDOWN_MS = 3e3;
var handler3 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const ctx = await resolveConnection(connectionId);
  if (!ctx) return { statusCode: 404, body: "no conn" };
  const room = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: roomPK(ctx.roomId), SK: roomMetaSK() }
    })
  );
  if (!room.Item) return { statusCode: 404, body: "no room" };
  const startedAt = Date.now() + COUNTDOWN_MS;
  try {
    await ddb.send(
      new UpdateCommand3({
        TableName: TABLE,
        Key: { PK: roomPK(ctx.roomId), SK: roomMetaSK() },
        UpdateExpression: "SET #s = :countdown, started_at = :ts, version = version + :one",
        ConditionExpression: "#s = :lobby",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":countdown": "countdown",
          ":lobby": "lobby",
          ":ts": startedAt,
          ":one": 1
        }
      })
    );
  } catch (e) {
    if (e?.name === "ConditionalCheckFailedException") {
      return { statusCode: 409, body: "already started" };
    }
    throw e;
  }
  return { statusCode: 200, body: "ok" };
};

// ws/finish.ts
import {
  GetCommand as GetCommand2,
  PutCommand,
  UpdateCommand as UpdateCommand4
} from "@aws-sdk/lib-dynamodb";

// src/shared/wpm.ts
var MS_PER_MIN = 6e4;
var CHARS_PER_WORD = 5;
function grossWpm(charsTyped, elapsedMs) {
  if (elapsedMs <= 0 || charsTyped <= 0) return 0;
  return charsTyped / CHARS_PER_WORD / (elapsedMs / MS_PER_MIN);
}
function netWpm(charsTyped, errors, elapsedMs) {
  if (elapsedMs <= 0) return 0;
  const minutes = elapsedMs / MS_PER_MIN;
  return Math.max(0, (charsTyped / CHARS_PER_WORD - errors) / minutes);
}
function accuracy(charsTyped, errors) {
  if (charsTyped <= 0) return 0;
  const raw = (charsTyped - errors) / charsTyped;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}
function scaledWpm(charsTyped, errors, elapsedMs) {
  return netWpm(charsTyped, errors, elapsedMs) * accuracy(charsTyped, errors);
}

// ws/finish.ts
var handler4 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const ctx = await resolveConnection(connectionId);
  if (!ctx) return { statusCode: 404, body: "no conn" };
  let msg;
  try {
    msg = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: "bad json" };
  }
  const charsTyped = Math.max(0, Number(msg.chars_typed) | 0);
  const errors = Math.max(0, Number(msg.errors) | 0);
  const room = await ddb.send(
    new GetCommand2({
      TableName: TABLE,
      Key: { PK: roomPK(ctx.roomId), SK: roomMetaSK() }
    })
  );
  if (!room.Item?.started_at) return { statusCode: 409, body: "not started" };
  const snippet = await ddb.send(
    new GetCommand2({
      TableName: TABLE,
      Key: { PK: snippetPK(room.Item.snippet_id), SK: "META" }
    })
  );
  if (!snippet.Item) return { statusCode: 404, body: "snippet missing" };
  if (charsTyped < snippet.Item.length) {
    return { statusCode: 400, body: "incomplete" };
  }
  const finishedAt = Date.now();
  const elapsedMs = finishedAt - room.Item.started_at;
  const gross = grossWpm(charsTyped, elapsedMs);
  const net = netWpm(charsTyped, errors, elapsedMs);
  const acc = accuracy(charsTyped, errors);
  const scaled = scaledWpm(charsTyped, errors, elapsedMs);
  await ddb.send(
    new UpdateCommand4({
      TableName: TABLE,
      Key: { PK: roomPK(ctx.roomId), SK: `PLAYER#${ctx.displayName}` },
      UpdateExpression: "SET finished_at = :f, gross_wpm = :g, net_wpm = :n, accuracy = :a, scaled_wpm = :s, progress = :p",
      ConditionExpression: "attribute_not_exists(finished_at)",
      ExpressionAttributeValues: {
        ":f": finishedAt,
        ":g": gross,
        ":n": net,
        ":a": acc,
        ":s": scaled,
        ":p": 1
      }
    })
  ).catch((e) => {
    if (e?.name !== "ConditionalCheckFailedException") throw e;
  });
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: roomPK(ctx.roomId),
        SK: resultSK(finishedAt, ctx.displayName),
        GSI1PK: hostGSI1PK(room.Item.host_id),
        GSI1SK: finishedGSI1SK(finishedAt),
        room_id: ctx.roomId,
        display_name: ctx.displayName,
        finished_at: finishedAt,
        gross_wpm: gross,
        net_wpm: net,
        accuracy: acc,
        scaled_wpm: scaled,
        chars_typed: charsTyped,
        errors
      }
    })
  );
  return { statusCode: 200, body: "ok" };
};

// ws/default.ts
var handler5 = async (event, ctx) => {
  let action;
  try {
    action = JSON.parse(event.body ?? "{}").action;
  } catch {
    return { statusCode: 400, body: "bad json" };
  }
  switch (action) {
    case "cursor":
      return handler(event, ctx, () => {
      });
    case "ping":
      return handler2(event, ctx, () => {
      });
    case "start":
      return handler3(event, ctx, () => {
      });
    case "finish":
      return handler4(event, ctx, () => {
      });
    default:
      return { statusCode: 400, body: "unknown action" };
  }
};
export {
  handler5 as handler
};
