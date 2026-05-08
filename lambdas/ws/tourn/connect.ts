import { TournWsConnectQuerySchema } from "@codetype/shared/tournaments";
import { DomainError } from "@codetype/domain";
import { withWsLifecycle } from "../../src/middleware";
import { AppError, requireTournamentsEnabled } from "../../src/AppError";
import { commandBus, ConnectToTournamentBracketCommand } from "../_container";

export const handler = withWsLifecycle(async (event, ctx) => {
    requireTournamentsEnabled();
    const qs =
        (event as unknown as { queryStringParameters?: Record<string, string> })
            .queryStringParameters ?? {};
    const parsed = TournWsConnectQuerySchema.parse(qs);
    try {
        await commandBus.dispatch(
            new ConnectToTournamentBracketCommand({
                tournId: parsed.tournId,
                userId: parsed.userId,
                connectionId: ctx.connectionId,
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
