import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "../src/ddb";
import { error, json } from "../src/http-resp";
import {
  codeGSI1PK,
  playerSK,
  roomPK,
} from "@codetype/shared/ddb-keys";

const NAME_RE = /^[A-Za-z0-9 _-]{1,24}$/;
const MAX_PLAYERS = 8;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  let body: { code?: string; display_name?: string };
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return error(400, "invalid json");
  }
  const code = body.code?.toUpperCase();
  const name = body.display_name?.trim();
  if (!code || !name) return error(400, "code and display_name required");
  if (!NAME_RE.test(name)) return error(400, "invalid display_name");

  const lookup = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": codeGSI1PK(code) },
      Limit: 1,
    }),
  );
  const roomItem = lookup.Items?.[0];
  if (!roomItem) return error(404, "room not found");
  if (roomItem.status !== "lobby") return error(409, "room not joinable");

  const roomId = roomItem.room_id as string;

  const players = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": roomPK(roomId),
        ":sk": "PLAYER#",
      },
      Select: "COUNT",
    }),
  );
  if ((players.Count ?? 0) >= MAX_PLAYERS) return error(409, "room full");

  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: roomPK(roomId),
          SK: playerSK(name),
          display_name: name,
          joined_at: Date.now(),
          chars_typed: 0,
          errors: 0,
          progress: 0,
        },
        ConditionExpression: "attribute_not_exists(SK)",
      }),
    );
  } catch (e: any) {
    if (e?.name === "ConditionalCheckFailedException") {
      return error(409, "display_name taken");
    }
    throw e;
  }

  return json(200, {
    room_id: roomId,
    snippet_id: roomItem.snippet_id,
    status: roomItem.status,
  });
};
