import { z } from "zod";
import {
    GetRoomResponseSchema,
    RoomCodeSchema,
} from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError } from "../src/AppError";
import { GetRoomQuery, queryBus } from "./_container";

const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const code = RoomCodeSchema.parse(ctx.pathParameters.code ?? "");
    try {
        const result = await queryBus.execute(new GetRoomQuery(code));
        return GetRoomResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
