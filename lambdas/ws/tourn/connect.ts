import { TournWsConnectQuerySchema } from "@codetype/shared/tournaments";
import { withWsLifecycle } from "../../src/middleware";
import { Errors, requireTournamentsEnabled } from "../../src/AppError";
import { tournaments } from "../../src/repos/TournamentRepo";
import { matches } from "../../src/repos/MatchRepo";
import { tournConnections } from "../../src/repos/TournConnectionRepo";
import { sendInitToConn } from "../../src/orchestration/bracketBroadcast";

export const handler = withWsLifecycle(async (event, ctx) => {
    requireTournamentsEnabled();
    const qs =
        (event as unknown as { queryStringParameters?: Record<string, string> })
            .queryStringParameters ?? {};
    const parsed = TournWsConnectQuerySchema.parse(qs);

    const t = await tournaments.get(parsed.tournId);
    if (!t) throw Errors.NotFound("tournament");

    await tournConnections.put(parsed.tournId, ctx.connectionId, parsed.userId);

    // Send BRACKET_INIT immediately so the viewer doesn't need to poll.
    const all = await matches.listAll(parsed.tournId);
    await sendInitToConn(ctx.connectionId, parsed.tournId, all);

    return { statusCode: 200, body: "connected" };
});
