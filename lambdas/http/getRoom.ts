import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "../src/ddb";
import { error, json } from "../src/http-resp";
import { codeGSI1PK } from "../src/shared/ddb-keys";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const code = event.pathParameters?.code?.toUpperCase();
  if (!code) return error(400, "code required");

  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": codeGSI1PK(code) },
      Limit: 1,
    }),
  );
  const item = r.Items?.[0];
  if (!item) return error(404, "room not found");

  return json(200, {
    room_id: item.room_id,
    code: item.code,
    snippet_id: item.snippet_id,
    status: item.status,
    started_at: item.started_at,
  });
};
