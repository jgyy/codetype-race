import { z } from "zod";
import { GetDailyResponseSchema } from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError } from "../src/AppError";
import { todayUTC } from "../src/repos/DailyRepo";
import { GetDailyQuery, queryBus } from "./_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async () => {
    try {
        const result = await queryBus.execute(new GetDailyQuery(todayUTC()));
        return GetDailyResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
