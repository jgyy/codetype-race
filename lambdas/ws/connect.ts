import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "../src/ddb";
import {
  codeGSI1PK,
  connGSI1PK,
  connSK,
  roomPK,
} from "@codetype/shared/ddb-keys";

const TTL_SECONDS = 30;

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const qs = (event as any).queryStringParameters ?? {};
  const code = qs.code?.toUpperCase();
  const name = qs.display_name;
  if (!code || !name) return { statusCode: 400, body: "missing params" };

  const lookup = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": codeGSI1PK(code) },
      Limit: 1,
    }),
  );
  const room = lookup.Items?.[0];
  if (!room) return { statusCode: 404, body: "room not found" };

  const connectionId = event.requestContext.connectionId!;
  const roomId = room.room_id as string;
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
        ttl: Math.floor(now / 1000) + TTL_SECONDS,
      },
    }),
  );

  return { statusCode: 200, body: "connected" };
};
