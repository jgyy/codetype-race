import {
    CreateTournamentRequestSchema,
    CreateTournamentResponseSchema,
} from "@codetype/shared/tournaments";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import {
    AppError,
    requireMod,
    requireTournamentsEnabled,
} from "../../src/AppError";
import { commandBus, CreateTournamentCommand } from "../_container";

export const handler = withHttp(
    CreateTournamentRequestSchema,
    async (input, ctx) => {
        requireTournamentsEnabled();
        requireMod(ctx);
        try {
            const result = await commandBus.dispatch(
                new CreateTournamentCommand({
                    hostId: ctx.userId!,
                    name: input.name,
                    size: input.size,
                    language: input.language,
                    difficulty: input.difficulty,
                    startsAt: input.startsAt,
                    registrationClosesAt: input.registrationClosesAt,
                    seasonId: input.seasonId,
                    nowIso: new Date().toISOString(),
                }),
            );
            return CreateTournamentResponseSchema.parse(result);
        } catch (e) {
            if (e instanceof DomainError) {
                throw new AppError(e.code, e.status, e.message, e.details);
            }
            throw e;
        }
    },
);
