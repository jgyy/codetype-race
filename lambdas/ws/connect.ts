import { WsConnectQuerySchema } from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withWsLifecycle } from "../src/middleware";
import { AppError } from "../src/AppError";
import { commandBus, ConnectToRoomCommand } from "./_container";

export const handler = withWsLifecycle(async (event, ctx) => {
    const qs = (event as unknown as { queryStringParameters?: Record<string, string> })
        .queryStringParameters ?? {};
    const parsed = WsConnectQuerySchema.parse(qs);
    const cursorLite = qs["cursor.lite"] === "true";

    try {
        await commandBus.dispatch(
            new ConnectToRoomCommand({
                connectionId: ctx.connectionId,
                code: parsed.code,
                displayName: parsed.display_name,
                role: parsed.role,
                cursorLite,
            }),
        );
        return { statusCode: 200, body: "connected" };
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
