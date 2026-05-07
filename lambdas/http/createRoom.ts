import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v7 as uuidv7 } from "uuid";
import { ddb, TABLE } from "../src/ddb";
import { error, json } from "../src/http-resp";
import {
  codeGSI1PK,
  generateRoomCode,
  roomMetaSK,
  roomPK,
  snippetPK,
} from "@codetype/shared/ddb-keys";
import type { Room } from "@codetype/shared/types";

const MAX_CODE_TRIES = 5;

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < MAX_CODE_TRIES; i++) {
    const code = generateRoomCode();
    const r = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": codeGSI1PK(code) },
        Limit: 1,
      }),
    );
    if (!r.Items || r.Items.length === 0) return code;
  }
  throw new Error("could not allocate unique room code");
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer<any> = async (
  event,
) => {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  const hostId = claims?.sub as string | undefined;
  if (!hostId) return error(401, "unauthorized");

  let body: { snippet_id?: string };
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return error(400, "invalid json");
  }
  if (!body.snippet_id) return error(400, "snippet_id required");

  const snippet = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: snippetPK(body.snippet_id), SK: "META" },
    }),
  );
  if (!snippet.Item) return error(404, "snippet not found");

  const roomId = uuidv7();
  const code = await uniqueCode();
  const now = Date.now();

  const room: Room = {
    room_id: roomId,
    code,
    host_id: hostId,
    snippet_id: body.snippet_id,
    status: "lobby",
    created_at: now,
    version: 0,
  };

  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: roomPK(roomId),
        SK: roomMetaSK(),
        GSI1PK: codeGSI1PK(code),
        GSI1SK: roomPK(roomId),
        ...room,
      },
      ConditionExpression: "attribute_not_exists(PK)",
    }),
  );

  return json(201, { room_id: roomId, code });
};
