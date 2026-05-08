import { v7 as uuidv7 } from "uuid";
import {
    CreateTournamentRequestSchema,
    CreateTournamentResponseSchema,
    type Tournament,
} from "@codetype/shared/tournaments";
import { withHttp } from "../../src/middleware";
import {
    Errors,
    requireMod,
    requireTournamentsEnabled,
} from "../../src/AppError";
import { tournaments } from "../../src/repos/TournamentRepo";

export const handler = withHttp(
    CreateTournamentRequestSchema,
    async (input, ctx) => {
        requireTournamentsEnabled();
        requireMod(ctx);

        const startsAt = new Date(input.startsAt).getTime();
        const closesAt = new Date(input.registrationClosesAt).getTime();
        if (closesAt > startsAt) {
            throw Errors.BadRequest(
                "registrationClosesAt must be <= startsAt",
            );
        }

        const t: Tournament = {
            id: uuidv7(),
            name: input.name,
            size: input.size,
            language: input.language,
            difficulty: input.difficulty,
            status: "registering",
            startsAt: input.startsAt,
            registrationClosesAt: input.registrationClosesAt,
            seasonId: input.seasonId,
            hostId: ctx.userId!,
            createdAt: new Date().toISOString(),
            winnerId: null,
        };
        await tournaments.create(t);
        return CreateTournamentResponseSchema.parse({ id: t.id });
    },
);
