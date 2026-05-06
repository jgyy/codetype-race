import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";
import { handler as cursor } from "./cursor";
import { handler as heartbeat } from "./heartbeat";
import { handler as start } from "./start";
import { handler as finish } from "./finish";

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event, ctx) => {
  let action: string | undefined;
  try {
    action = JSON.parse(event.body ?? "{}").action;
  } catch {
    return { statusCode: 400, body: "bad json" };
  }
  switch (action) {
    case "cursor":
      return cursor(event, ctx, () => {}) as any;
    case "ping":
      return heartbeat(event, ctx, () => {}) as any;
    case "start":
      return start(event, ctx, () => {}) as any;
    case "finish":
      return finish(event, ctx, () => {}) as any;
    default:
      return { statusCode: 400, body: "unknown action" };
  }
};
