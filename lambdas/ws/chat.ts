import type { z } from "zod";
import type { WsChatSchema } from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { AppError } from "../src/AppError";
import { commandBus, SendChatCommand } from "./_container";

type ChatMsg = z.infer<typeof WsChatSchema>;

export async function applyChat(
    input: ChatMsg,
    connectionId: string,
): Promise<void> {
    try {
        await commandBus.dispatch(
            new SendChatCommand({ connectionId, text: input.text }),
        );
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
}
