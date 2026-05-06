import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "../src/ddb";
import { error, json } from "../src/http-resp";
import { hostGSI1PK } from "../src/shared/ddb-keys";

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer<any> = async (
  event,
) => {
  const hostId = event.requestContext.authorizer?.jwt?.claims?.sub as
    | string
    | undefined;
  if (!hostId) return error(401, "unauthorized");

  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": hostGSI1PK(hostId) },
      ScanIndexForward: false,
      Limit: 50,
    }),
  );

  return json(200, { results: r.Items ?? [] });
};
