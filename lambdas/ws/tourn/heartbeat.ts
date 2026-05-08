import { z } from "zod";
import { DomainError } from "@codetype/domain";
import { withWs } from "../../src/middleware";
import { AppError } from "../../src/AppError";
import { commandBus, TournHeartbeatCommand } from "../_container";

const HeartbeatSchema = z.object({ type: z.literal("HEARTBEAT") });

export const handler = withWs(HeartbeatSchema, async (_input, ctx) => {
    try {
        await commandBus.dispatch(new TournHeartbeatCommand(ctx.connectionId));
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
