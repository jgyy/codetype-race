import { z } from "zod";

export const EventTypeSchema = z.enum([
    "RACE_FINISHED",
    "ROOM_JOINED",
    "DAILY_DONE",
    "TOURN_WON",
    "ACHIEVEMENT_UNLOCKED",
    "XP_GAINED",
    "QUEST_COMPLETED",
    "LEVEL_UP",
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const EventSourceSchema = z.enum(["stream", "replay", "admin"]);
export type EventSource = z.infer<typeof EventSourceSchema>;

export const EventEnvelopeSchema = z.object({
    id: z.string().uuid(),
    type: EventTypeSchema,
    occurredAt: z.string().datetime(),
    userId: z.string().min(1),
    payload: z.record(z.string(), z.unknown()),
    source: EventSourceSchema,
    v: z.literal(1).default(1),
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const RaceFinishedPayloadSchema = z.object({
    roomId: z.string(),
    displayName: z.string(),
    finishedAt: z.number().int().nonnegative(),
    language: z.string().optional(),
    wpm: z.number().nonnegative().optional(),
    accuracy: z.number().min(0).max(1).optional(),
    placement: z.number().int().positive().optional(),
});
export type RaceFinishedPayload = z.infer<typeof RaceFinishedPayloadSchema>;

export const RoomJoinedPayloadSchema = z.object({
    roomId: z.string(),
    displayName: z.string(),
    joinedAt: z.number().int().nonnegative(),
});
export type RoomJoinedPayload = z.infer<typeof RoomJoinedPayloadSchema>;

export const DailyDonePayloadSchema = z.object({
    date: z.string(),
    completedAt: z.number().int().nonnegative(),
});
export type DailyDonePayload = z.infer<typeof DailyDonePayloadSchema>;

export const TournWonPayloadSchema = z.object({
    tournId: z.string(),
    round: z.number().int().nonnegative(),
});
export type TournWonPayload = z.infer<typeof TournWonPayloadSchema>;
