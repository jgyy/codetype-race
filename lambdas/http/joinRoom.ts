import {
    JoinRoomRequestSchema,
    JoinRoomResponseSchema,
} from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError } from "../src/AppError";
import { commandBus, JoinRoomCommand } from "./_container";

export const handler = withHttp(JoinRoomRequestSchema, async (input) => {
    try {
        const result = await commandBus.dispatch(
            new JoinRoomCommand({
                code: input.code,
                displayName: input.display_name,
                role: input.role,
            }),
        );
        return JoinRoomResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
