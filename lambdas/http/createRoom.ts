import {
    CreateRoomRequestSchema,
    CreateRoomResponseSchema,
} from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError, Errors } from "../src/AppError";
import { commandBus, CreateRoomCommand } from "./_container";

export const handler = withHttp(
    CreateRoomRequestSchema,
    async (input, ctx) => {
        if (!ctx.userId) throw Errors.Unauthorized();
        try {
            const result = await commandBus.dispatch(
                new CreateRoomCommand({
                    hostId: ctx.userId,
                    snippetId: input.snippet_id,
                    filters: input.filters,
                    previousRoomId: input.previous_room_id,
                    newSnippet: input.new_snippet,
                    mode: input.mode,
                    teams: input.teams,
                }),
            );
            return CreateRoomResponseSchema.parse(result);
        } catch (e) {
            if (e instanceof DomainError) {
                throw new AppError(e.code, e.status, e.message, e.details);
            }
            throw e;
        }
    },
);
