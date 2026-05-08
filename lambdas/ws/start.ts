import { DomainError } from "@codetype/domain";
import { AppError } from "../src/AppError";
import { commandBus, StartCountdownCommand } from "./_container";

export async function applyStart(connectionId: string): Promise<void> {
    try {
        await commandBus.dispatch(new StartCountdownCommand({ connectionId }));
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
}
