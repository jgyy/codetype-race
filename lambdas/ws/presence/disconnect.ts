import { withWsLifecycle } from "../../src/middleware";
import { commandBus, DisconnectPresenceCommand } from "../_container";

export const handler = withWsLifecycle(async (_event, ctx) => {
    await commandBus.dispatch(new DisconnectPresenceCommand(ctx.connectionId));
    return { statusCode: 200, body: "ok" };
});
