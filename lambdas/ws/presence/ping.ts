import { WsPresenceClientMsgSchema } from "@codetype/shared/social";
import { withWs } from "../../src/middleware";
import { commandBus, TouchPresenceCommand } from "../_container";

export const handler = withWs(WsPresenceClientMsgSchema, async (_msg, ctx) => {
    await commandBus.dispatch(new TouchPresenceCommand(ctx.connectionId));
});
