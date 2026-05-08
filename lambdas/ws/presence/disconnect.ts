import { withWsLifecycle } from "../../src/middleware";
import { presence } from "../../src/repos/PresenceRepo";

export const handler = withWsLifecycle(async (_event, ctx) => {
    await presence.deleteByConnection(ctx.connectionId);
    return { statusCode: 200, body: "ok" };
});
