import { WsPresenceClientMsgSchema } from "@codetype/shared/social";
import { withWs } from "../../src/middleware";
import { presence } from "../../src/repos/PresenceRepo";

export const handler = withWs(WsPresenceClientMsgSchema, async (_msg, ctx) => {
    const userId = await presence.userIdByConnection(ctx.connectionId);
    if (!userId) return;
    await presence.touch(userId, ctx.connectionId);
});
