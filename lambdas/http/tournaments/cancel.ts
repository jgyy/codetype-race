import { z } from "zod";
import { withHttp } from "../../src/middleware";
import {
    Errors,
    requireMod,
    requireTournamentsEnabled,
} from "../../src/AppError";
import { tournaments } from "../../src/repos/TournamentRepo";

const EmptyBody = z.object({}).passthrough();

/**
 * Cancel a tournament. Allowed from any non-terminal status. Reverse-Elo
 * refund for already-played matches relies on the Phase 14 event log; until
 * that lands, cancelling a `running` tournament leaves entrants' applied
 * deltas intact and emits a TODO marker. Cancelling from `registering` or
 * `seeding` is a no-op for ratings since no matches have been played yet.
 */
export const handler = withHttp(z.object({}).passthrough(), async (_input, ctx) => {
    requireTournamentsEnabled();
    requireMod(ctx);
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("missing tournament id");

    const t = await tournaments.get(id);
    if (!t) throw Errors.NotFound("tournament");
    if (t.status === "finished" || t.status === "cancelled") {
        throw Errors.Conflict(`already ${t.status}`);
    }

    const ok = await tournaments.transitionStatus(id, t.status, "cancelled");
    if (!ok) throw Errors.Conflict("status changed concurrently; retry");
    return { ok: true } as const;
});
