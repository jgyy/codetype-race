import { withWsLifecycle } from "../../src/middleware";
import { Errors, requirePresenceEnabled } from "../../src/AppError";
import { commandBus, ConnectPresenceCommand } from "../_container";

export const handler = withWsLifecycle(async (event, ctx) => {
    requirePresenceEnabled();
    const qs = (event as unknown as { queryStringParameters?: Record<string, string> })
        .queryStringParameters ?? {};
    const userId = qs.user_id;
    if (!userId) throw Errors.Unauthorized();
    await commandBus.dispatch(
        new ConnectPresenceCommand({ userId, connectionId: ctx.connectionId }),
    );
    return { statusCode: 200, body: "connected" };
});
