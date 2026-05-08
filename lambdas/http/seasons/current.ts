import { z } from "zod";
import { CurrentSeasonResponseSchema } from "@codetype/shared/tournaments";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError } from "../../src/AppError";
import { GetCurrentSeasonQuery, queryBus } from "../_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async () => {
    try {
        const result = await queryBus.execute(
            new GetCurrentSeasonQuery(Date.now()),
        );
        return CurrentSeasonResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
