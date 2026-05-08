import { z } from "zod";
import { GetTournamentResponseSchema } from "@codetype/shared/tournaments";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, Errors } from "../../src/AppError";
import { GetTournamentQuery, queryBus } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const id = ctx.pathParameters.id;
    if (!id) throw Errors.BadRequest("missing tournament id");
    try {
        const result = await queryBus.execute(new GetTournamentQuery(id));
        return GetTournamentResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
