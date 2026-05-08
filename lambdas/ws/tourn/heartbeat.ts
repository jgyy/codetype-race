import { z } from "zod";
import { withWs } from "../../src/middleware";
import { Errors } from "../../src/AppError";
import { tournConnections } from "../../src/repos/TournConnectionRepo";

const HeartbeatSchema = z.object({ type: z.literal("HEARTBEAT") });

export const handler = withWs(HeartbeatSchema, async (_input, ctx) => {
    const row = await tournConnections.byConnectionId(ctx.connectionId);
    if (!row) throw Errors.NotFound("connection");
    // Refresh TTL by re-putting the row.
    await tournConnections.put(row.tourn_id, ctx.connectionId, row.user_id);
});
