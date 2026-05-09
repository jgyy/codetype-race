import { z } from "zod";
import {
    ListTournamentsResponseSchema,
    TournamentStatusSchema,
} from "@codetype/shared/tournaments";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { CacheControl } from "../../src/cacheControl";
import { AppError } from "../../src/AppError";
import { ListTournamentsQuery, queryBus } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(
    EmptyBody,
    async (_input, ctx) => {
        const status = TournamentStatusSchema.parse(
            ctx.queryStringParameters.status ?? "registering",
        );
        try {
            const result = await queryBus.execute(new ListTournamentsQuery(status));
            return ListTournamentsResponseSchema.parse(result);
        } catch (e) {
            if (e instanceof DomainError) {
                throw new AppError(e.code, e.status, e.message, e.details);
            }
            throw e;
        }
    },
    { cacheControl: CacheControl.TOURNAMENT_LIST },
);
