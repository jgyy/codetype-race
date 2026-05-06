// http/listHistory.ts
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
var hostGSI1PK = (hostId) => `HOST#${hostId}`;

// http/listHistory.ts
var handler = async (event) => {
  const hostId = event.requestContext.authorizer?.jwt?.claims?.sub;
  if (!hostId) return error(401, "unauthorized");
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": hostGSI1PK(hostId) },
      ScanIndexForward: false,
      Limit: 50
    })
  );
  return json(200, { results: r.Items ?? [] });
};
export {
  handler
};
