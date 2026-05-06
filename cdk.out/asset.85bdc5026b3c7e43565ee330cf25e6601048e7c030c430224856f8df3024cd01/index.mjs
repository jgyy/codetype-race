// http/createRoom.ts
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

// node_modules/uuid/dist/esm-node/stringify.js
var byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}

// node_modules/uuid/dist/esm-node/rng.js
import crypto from "node:crypto";
var rnds8Pool = new Uint8Array(256);
var poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    crypto.randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}

// node_modules/uuid/dist/esm-node/v7.js
var _seqLow = null;
var _seqHigh = null;
var _msecs = 0;
function v7(options, buf, offset) {
  options = options || {};
  let i = buf && offset || 0;
  const b = buf || new Uint8Array(16);
  const rnds = options.random || (options.rng || rng)();
  const msecs = options.msecs !== void 0 ? options.msecs : Date.now();
  let seq = options.seq !== void 0 ? options.seq : null;
  let seqHigh = _seqHigh;
  let seqLow = _seqLow;
  if (msecs > _msecs && options.msecs === void 0) {
    _msecs = msecs;
    if (seq !== null) {
      seqHigh = null;
      seqLow = null;
    }
  }
  if (seq !== null) {
    if (seq > 2147483647) {
      seq = 2147483647;
    }
    seqHigh = seq >>> 19 & 4095;
    seqLow = seq & 524287;
  }
  if (seqHigh === null || seqLow === null) {
    seqHigh = rnds[6] & 127;
    seqHigh = seqHigh << 8 | rnds[7];
    seqLow = rnds[8] & 63;
    seqLow = seqLow << 8 | rnds[9];
    seqLow = seqLow << 5 | rnds[10] >>> 3;
  }
  if (msecs + 1e4 > _msecs && seq === null) {
    if (++seqLow > 524287) {
      seqLow = 0;
      if (++seqHigh > 4095) {
        seqHigh = 0;
        _msecs++;
      }
    }
  } else {
    _msecs = msecs;
  }
  _seqHigh = seqHigh;
  _seqLow = seqLow;
  b[i++] = _msecs / 1099511627776 & 255;
  b[i++] = _msecs / 4294967296 & 255;
  b[i++] = _msecs / 16777216 & 255;
  b[i++] = _msecs / 65536 & 255;
  b[i++] = _msecs / 256 & 255;
  b[i++] = _msecs & 255;
  b[i++] = seqHigh >>> 4 & 15 | 112;
  b[i++] = seqHigh & 255;
  b[i++] = seqLow >>> 13 & 63 | 128;
  b[i++] = seqLow >>> 5 & 255;
  b[i++] = seqLow << 3 & 255 | rnds[10] & 7;
  b[i++] = rnds[11];
  b[i++] = rnds[12];
  b[i++] = rnds[13];
  b[i++] = rnds[14];
  b[i++] = rnds[15];
  return buf || unsafeStringify(b);
}
var v7_default = v7;

// src/ddb.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
var client = new DynamoDBClient({});
var ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});
var TABLE = process.env.TABLE_NAME;

// src/http-resp.ts
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};
var json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", ...CORS },
  body: JSON.stringify(body)
});
var error = (statusCode, message) => json(statusCode, { error: message });

// src/shared/ddb-keys.ts
var roomPK = (roomId) => `ROOM#${roomId}`;
var roomMetaSK = () => "META";
var snippetPK = (snippetId) => `SNIPPET#${snippetId}`;
var codeGSI1PK = (code) => `CODE#${code}`;
var CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function generateRoomCode(rand = Math.random) {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return out;
}

// http/createRoom.ts
var MAX_CODE_TRIES = 5;
async function uniqueCode() {
  for (let i = 0; i < MAX_CODE_TRIES; i++) {
    const code = generateRoomCode();
    const r = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": codeGSI1PK(code) },
        Limit: 1
      })
    );
    if (!r.Items || r.Items.length === 0) return code;
  }
  throw new Error("could not allocate unique room code");
}
var handler = async (event) => {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  const hostId = claims?.sub;
  if (!hostId) return error(401, "unauthorized");
  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return error(400, "invalid json");
  }
  if (!body.snippet_id) return error(400, "snippet_id required");
  const snippet = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: snippetPK(body.snippet_id), SK: "META" }
    })
  );
  if (!snippet.Item) return error(404, "snippet not found");
  const roomId = v7_default();
  const code = await uniqueCode();
  const now = Date.now();
  const room = {
    room_id: roomId,
    code,
    host_id: hostId,
    snippet_id: body.snippet_id,
    status: "lobby",
    created_at: now,
    version: 0
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: roomPK(roomId),
        SK: roomMetaSK(),
        GSI1PK: codeGSI1PK(code),
        GSI1SK: roomPK(roomId),
        ...room
      },
      ConditionExpression: "attribute_not_exists(PK)"
    })
  );
  return json(201, { room_id: roomId, code });
};
export {
  handler
};
