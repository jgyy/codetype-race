// http/getRoom.ts
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

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
var codeGSI1PK = (code) => `CODE#${code}`;

// http/getRoom.ts
var handler = async (event) => {
  const code = event.pathParameters?.code?.toUpperCase();
  if (!code) return error(400, "code required");
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": codeGSI1PK(code) },
      Limit: 1
    })
  );
  const item = r.Items?.[0];
  if (!item) return error(404, "room not found");
  return json(200, {
    room_id: item.room_id,
    code: item.code,
    snippet_id: item.snippet_id,
    status: item.status,
    started_at: item.started_at
  });
};
export {
  handler
};
