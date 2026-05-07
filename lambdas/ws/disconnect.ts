import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";
import { DeleteCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "../src/ddb";
import { connGSI1PK, playerSK } from "@codetype/shared/ddb-keys";

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId!;

  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": connGSI1PK(connectionId) },
      Limit: 1,
    }),
  );
  const conn = r.Items?.[0];
  if (!conn) return { statusCode: 200, body: "noop" };

  const pk = conn.PK as string;
  const name = conn.display_name as string;

  await ddb.send(
    new DeleteCommand({ TableName: TABLE, Key: { PK: pk, SK: conn.SK } }),
  );

  // Mark player DNF if race is running
  await ddb
    .send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: pk, SK: playerSK(name) },
        UpdateExpression: "SET is_dnf = :t",
        ConditionExpression:
          "attribute_exists(SK) AND attribute_not_exists(finished_at)",
        ExpressionAttributeValues: { ":t": true },
      }),
    )
    .catch(() => {});

  return { statusCode: 200, body: "ok" };
};
