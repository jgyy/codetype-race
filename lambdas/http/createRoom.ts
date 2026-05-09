import {
    CreateRoomRequestSchema,
    CreateRoomResponseSchema,
} from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError, Errors } from "../src/AppError";
import { maybeDualWrite } from "../src/raceDualWrite";
import { commandBus, CreateRoomCommand } from "./_container";

export const handler = withHttp(
    CreateRoomRequestSchema,
    async (input, ctx) => {
        if (!ctx.userId) throw Errors.Unauthorized();
        const userId = ctx.userId;
        try {
            const result = await maybeDualWrite({
                path: "createRoom",
                legacy: () =>
                    commandBus.dispatch(
                        new CreateRoomCommand({
                            hostId: userId,
                            snippetId: input.snippet_id,
                            filters: input.filters,
                            previousRoomId: input.previous_room_id,
                            newSnippet: input.new_snippet,
                            mode: input.mode,
                            teams: input.teams,
                        }),
                    ),
                userId: () => userId,
                raceId: (legacy) => legacy.room_id,
                toEvents: (legacy) => ({
                    events: [
                        {
                            type: "RACE_CREATED",
                            actorId: userId,
                            payload: {
                                roomId: legacy.room_id,
                                code: legacy.code,
                                snippetId: input.snippet_id ?? null,
                                mode: input.mode ?? "solo",
                            },
                        },
                    ],
                    result: { raceId: legacy.room_id },
                }),
            });
            return CreateRoomResponseSchema.parse(result);
        } catch (e) {
            if (e instanceof DomainError) {
                throw new AppError(e.code, e.status, e.message, e.details);
            }
            throw e;
        }
    },
);
