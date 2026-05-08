import { withWsLifecycle } from "../../src/middleware";
import { tournConnections } from "../../src/repos/TournConnectionRepo";

export const handler = withWsLifecycle(async (_event, ctx) => {
    const row = await tournConnections.byConnectionId(ctx.connectionId);
    if (row) await tournConnections.delete(row.tourn_id, ctx.connectionId);
    return { statusCode: 200, body: "disconnected" };
});
