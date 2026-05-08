import type { z } from "zod";
import type { WsFinishSchema } from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { AppError } from "../src/AppError";
import { commandBus, FinishRaceCommand } from "./_container";

type FinishMsg = z.infer<typeof WsFinishSchema>;

export async function applyFinish(
    input: FinishMsg,
    connectionId: string,
): Promise<void> {
    try {
        await commandBus.dispatch(
            new FinishRaceCommand({
                connectionId,
                chars_typed: input.chars_typed,
                errors: input.errors,
            }),
        );
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
}
