// ws/disconnect.ts
import { DeleteCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

// src/ddb.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
var client = new DynamoDBClient({});
var ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});
var TABLE = process.env.TABLE_NAME;

// src/shared/ddb-keys.ts
var playerSK = (displayName) => `PLAYER#${displayName}`;
var connGSI1PK = (connectionId) => `CONN#${connectionId}`;

// ws/disconnect.ts
var handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": connGSI1PK(connectionId) },
      Limit: 1
    })
  );
  const conn = r.Items?.[0];
  if (!conn) return { statusCode: 200, body: "noop" };
  const pk = conn.PK;
  const name = conn.display_name;
  await ddb.send(
    new DeleteCommand({ TableName: TABLE, Key: { PK: pk, SK: conn.SK } })
  );
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: pk, SK: playerSK(name) },
      UpdateExpression: "SET is_dnf = :t",
      ConditionExpression: "attribute_exists(SK) AND attribute_not_exists(finished_at)",
      ExpressionAttributeValues: { ":t": true }
    })
  ).catch(() => {
  });
  return { statusCode: 200, body: "ok" };
};
export {
  handler
};
