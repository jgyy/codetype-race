import { z } from "zod";
import { RACE_EVENT_TYPES } from "@codetype/domain/events/RaceEvent";
import type {
    RaceEvent,
    RaceEventType,
} from "@codetype/domain/events/RaceEvent";

export const RaceEventTypeSchema = z.enum(
    RACE_EVENT_TYPES as unknown as [RaceEventType, ...RaceEventType[]],
);

export const RaceEventSchema: z.ZodType<RaceEvent> = z.object({
    raceId: z.string().uuid(),
    seq: z.number().int().nonnegative(),
    type: RaceEventTypeSchema,
    occurredAt: z.string().datetime(),
    actorId: z.string().nullable(),
    payload: z.record(z.unknown()),
    commandId: z.string().uuid().nullable(),
    causationId: z.string().uuid().nullable(),
    correlationId: z.string().uuid(),
});

export type {
    RaceEvent,
    RaceEventType,
    PlayerJoinedPayload,
    CursorProgressPayload,
    PlayerFinishedPayload,
    PlayerFlaggedPayload,
} from "@codetype/domain/events/RaceEvent";

export const PlayerJoinedPayloadSchema = z.object({
    userId: z.string(),
    displayName: z.string(),
});
export const CursorProgressPayloadSchema = z.object({
    userId: z.string(),
    charsTyped: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
    accuracy: z.number().min(0).max(1),
});
export const PlayerFinishedPayloadSchema = z.object({
    finishedAt: z.string().datetime(),
    charsTyped: z.number().int().nonnegative(),
    accuracy: z.number().min(0).max(1),
    wpm: z.number().nonnegative(),
});
export const PlayerFlaggedPayloadSchema = z.object({
    reason: z.string(),
});
