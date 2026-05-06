// ws/connect.ts
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

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
var connSK = (connectionId) => `CONN#${connectionId}`;
var codeGSI1PK = (code) => `CODE#${code}`;
var connGSI1PK = (connectionId) => `CONN#${connectionId}`;

// ws/connect.ts
var TTL_SECONDS = 30;
var handler = async (event) => {
  const qs = event.queryStringParameters ?? {};
  const code = qs.code?.toUpperCase();
  const name = qs.display_name;
  if (!code || !name) return { statusCode: 400, body: "missing params" };
  const lookup = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": codeGSI1PK(code) },
      Limit: 1
    })
  );
  const room = lookup.Items?.[0];
  if (!room) return { statusCode: 404, body: "room not found" };
  const connectionId = event.requestContext.connectionId;
  const roomId = room.room_id;
  const now = Date.now();
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: roomPK(roomId),
        SK: connSK(connectionId),
        GSI1PK: connGSI1PK(connectionId),
        GSI1SK: roomPK(roomId),
        connection_id: connectionId,
        display_name: name,
        joined_at: now,
        ttl: Math.floor(now / 1e3) + TTL_SECONDS
      }
    })
  );
  return { statusCode: 200, body: "connected" };
};
export {
  handler
};
