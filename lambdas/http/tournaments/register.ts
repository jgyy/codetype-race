import { z } from "zod";
import { RegisterResponseSchema } from "@codetype/shared/tournaments";
import { withHttp } from "../../src/middleware";
import {
    Errors,
    requireTournamentsEnabled,
} from "../../src/AppError";
import { tournaments } from "../../src/repos/TournamentRepo";
import { users, STARTING_RATING } from "../../src/repos/UserRepo";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    requireTournamentsEnabled();
    if (!ctx.userId) throw Errors.Unauthorized();
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("missing tournament id");

    const t = await tournaments.get(id);
    if (!t) throw Errors.NotFound("tournament");
    if (t.status !== "registering") {
        throw Errors.Conflict(`tournament not open for registration (status=${t.status})`);
    }
    if (Date.now() >= new Date(t.registrationClosesAt).getTime()) {
        throw Errors.Conflict("registration closed");
    }

    const entrants = await tournaments.listEntrants(id);
    if (entrants.length >= t.size) {
        throw Errors.Conflict("tournament full");
    }

    const profile = await users.getProfile(ctx.userId);
    const rating = profile?.rating ?? STARTING_RATING;
    const displayName = profile?.display_name ?? ctx.userId;

    await tournaments.addEntrant({
        tournId: id,
        userId: ctx.userId,
        displayName,
        seedRank: null,
        snapshotRating: rating,
        registeredAt: new Date().toISOString(),
        eliminatedAt: null,
        dq: false,
    });

    return RegisterResponseSchema.parse({ ok: true, seedSnapshot: rating });
});
