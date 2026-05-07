import { WsClientMsgSchema } from "@codetype/shared/schemas";
import { withWs } from "../src/middleware";
import { Errors } from "../src/AppError";
import { applyCursor } from "./cursor";
import { applyHeartbeat } from "./heartbeat";
import { applyStart } from "./start";
import { applyFinish } from "./finish";

export const handler = withWs(WsClientMsgSchema, async (input, ctx) => {
  switch (input.action) {
    case "cursor":
      await applyCursor(input, ctx.connectionId);
      return;
    case "ping":
      await applyHeartbeat(ctx.connectionId);
      return;
    case "start":
      await applyStart(ctx.connectionId);
      return;
    case "finish":
      await applyFinish(input, ctx.connectionId);
      return;
    default: {
      // Should be unreachable thanks to the discriminated union.
      const _exhaustive: never = input;
      void _exhaustive;
      throw Errors.BadRequest("unknown action");
    }
  }
});
