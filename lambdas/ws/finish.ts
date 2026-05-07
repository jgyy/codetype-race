import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";
import {
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "../src/ddb";
import {
  finishedGSI1SK,
  hostGSI1PK,
  resultSK,
  roomMetaSK,
  roomPK,
  snippetPK,
} from "@codetype/shared/ddb-keys";
import { accuracy, grossWpm, netWpm, scaledWpm } from "@codetype/shared/wpm";
import { resolveConnection } from "../src/ws-helpers";

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  const ctx = await resolveConnection(connectionId);
  if (!ctx) return { statusCode: 404, body: "no conn" };

  let msg: any;
  try {
    msg = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: "bad json" };
  }

  const charsTyped = Math.max(0, Number(msg.chars_typed) | 0);
  const errors = Math.max(0, Number(msg.errors) | 0);

  const room = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: roomPK(ctx.roomId), SK: roomMetaSK() },
    }),
  );
  if (!room.Item?.started_at) return { statusCode: 409, body: "not started" };

  const snippet = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: snippetPK(room.Item.snippet_id), SK: "META" },
    }),
  );
  if (!snippet.Item) return { statusCode: 404, body: "snippet missing" };
  if (charsTyped < (snippet.Item.length as number)) {
    return { statusCode: 400, body: "incomplete" };
  }

  const finishedAt = Date.now();
  const elapsedMs = finishedAt - (room.Item.started_at as number);
  const gross = grossWpm(charsTyped, elapsedMs);
  const net = netWpm(charsTyped, errors, elapsedMs);
  const acc = accuracy(charsTyped, errors);
  const scaled = scaledWpm(charsTyped, errors, elapsedMs);

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: roomPK(ctx.roomId), SK: `PLAYER#${ctx.displayName}` },
      UpdateExpression:
        "SET finished_at = :f, gross_wpm = :g, net_wpm = :n, accuracy = :a, scaled_wpm = :s, progress = :p",
      ConditionExpression: "attribute_not_exists(finished_at)",
      ExpressionAttributeValues: {
        ":f": finishedAt,
        ":g": gross,
        ":n": net,
        ":a": acc,
        ":s": scaled,
        ":p": 1,
      },
    }),
  ).catch((e) => {
    if (e?.name !== "ConditionalCheckFailedException") throw e;
  });

  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: roomPK(ctx.roomId),
        SK: resultSK(finishedAt, ctx.displayName),
        GSI1PK: hostGSI1PK(room.Item.host_id as string),
        GSI1SK: finishedGSI1SK(finishedAt),
        room_id: ctx.roomId,
        display_name: ctx.displayName,
        finished_at: finishedAt,
        gross_wpm: gross,
        net_wpm: net,
        accuracy: acc,
        scaled_wpm: scaled,
        chars_typed: charsTyped,
        errors,
      },
    }),
  );

  return { statusCode: 200, body: "ok" };
};
