import { withWsLifecycle } from "../../src/middleware";
import { commandBus, DisconnectFromTournamentBracketCommand } from "../_container";

export const handler = withWsLifecycle(async (_event, ctx) => {
    await commandBus.dispatch(
        new DisconnectFromTournamentBracketCommand(ctx.connectionId),
    );
    return { statusCode: 200, body: "disconnected" };
});
