import { DomainError } from "@codetype/domain";
import { withWsLifecycle } from "../src/middleware";
import { AppError } from "../src/AppError";
import { commandBus, DisconnectFromRoomCommand } from "./_container";

export const handler = withWsLifecycle(async (_event, ctx) => {
    try {
        const { applied } = await commandBus.dispatch(
            new DisconnectFromRoomCommand({ connectionId: ctx.connectionId }),
        );
        return { statusCode: 200, body: applied ? "ok" : "noop" };
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
