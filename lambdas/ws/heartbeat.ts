import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "../src/ddb";
import { connSK } from "../src/shared/ddb-keys";
import { resolveConnection } from "../src/ws-helpers";

const TTL_SECONDS = 30;

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  const ctx = await resolveConnection(connectionId);
  if (!ctx) return { statusCode: 404, body: "no conn" };

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: {
        PK: `ROOM#${ctx.roomId}`,
        SK: connSK(connectionId),
      },
      UpdateExpression: "SET #ttl = :t",
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: {
        ":t": Math.floor(Date.now() / 1000) + TTL_SECONDS,
      },
    }),
  );
  return { statusCode: 200, body: "pong" };
};
