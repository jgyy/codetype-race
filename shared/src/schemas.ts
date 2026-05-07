import { z } from "zod";

export const RoomStatusSchema = z.enum([
    "lobby",
    "countdown",
    "running",
    "finished",
]);
export type RoomStatus = z.infer<typeof RoomStatusSchema>;

export const RoleSchema = z.enum(["racer", "spectator"]);
export type Role = z.infer<typeof RoleSchema>;

export const RoomCodeSchema = z
    .string()
    .length(6)
    .transform((s) => s.toUpperCase());

export const DisplayNameSchema = z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 _-]{1,24}$/, "invalid display_name");

export const RoomSchema = z.object({
    room_id: z.string(),
    code: z.string().length(6),
    host_id: z.string(),
    snippet_id: z.string(),
    status: RoomStatusSchema,
    created_at: z.number(),
    started_at: z.number().optional(),
    finished_at: z.number().optional(),
    version: z.number(),
});
export type Room = z.infer<typeof RoomSchema>;

export const PlayerSchema = z.object({
    display_name: z.string(),
    user_id: z.string().optional(),
    joined_at: z.number(),
    finished_at: z.number().optional(),
    gross_wpm: z.number().optional(),
    net_wpm: z.number().optional(),
    accuracy: z.number().optional(),
    scaled_wpm: z.number().optional(),
    chars_typed: z.number(),
    errors: z.number(),
    progress: z.number(),
    is_dnf: z.boolean().optional(),
    role: RoleSchema.optional().default("racer"),
});
export type Player = z.infer<typeof PlayerSchema>;

export const ConnectionSchema = z.object({
    connection_id: z.string(),
    display_name: z.string(),
    joined_at: z.number(),
    ttl: z.number(),
    role: RoleSchema.optional().default("racer"),
});
export type Connection = z.infer<typeof ConnectionSchema>;

export const DifficultySchema = z.number().int().min(1).max(5);

export const SnippetSchema = z.object({
    snippet_id: z.string(),
    language: z.string(),
    title: z.string(),
    code: z.string(),
    length: z.number(),
    difficulty: DifficultySchema.optional(),
    tags: z.array(z.string()).optional(),
});
export type Snippet = z.infer<typeof SnippetSchema>;

export const SnippetFiltersSchema = z.object({
    language: z.string().optional(),
    difficulty: DifficultySchema.optional(),
});
export type SnippetFilters = z.infer<typeof SnippetFiltersSchema>;

export const CreateRoomRequestSchema = z
    .object({
        snippet_id: z.string().min(1).optional(),
        filters: SnippetFiltersSchema.optional(),
        previous_room_id: z.string().min(1).optional(),
        new_snippet: z.boolean().optional(),
    })
    .refine(
        (v) => v.snippet_id || v.filters || v.previous_room_id,
        { message: "snippet_id, filters, or previous_room_id is required" },
    );
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

export const CreateRoomResponseSchema = z.object({
    room_id: z.string(),
    code: z.string().length(6),
});
export type CreateRoomResponse = z.infer<typeof CreateRoomResponseSchema>;

export const JoinRoomRequestSchema = z.object({
    code: RoomCodeSchema,
    display_name: DisplayNameSchema,
    role: RoleSchema.optional().default("racer"),
});
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;

export const JoinRoomResponseSchema = z.object({
    room_id: z.string(),
    snippet_id: z.string(),
    status: RoomStatusSchema,
});
export type JoinRoomResponse = z.infer<typeof JoinRoomResponseSchema>;

export const GetRoomPathSchema = z.object({
    code: RoomCodeSchema,
});
export type GetRoomPath = z.infer<typeof GetRoomPathSchema>;

export const GetRoomResponseSchema = z.object({
    room_id: z.string(),
    code: z.string(),
    snippet_id: z.string(),
    status: RoomStatusSchema,
    started_at: z.number().optional(),
});
export type GetRoomResponse = z.infer<typeof GetRoomResponseSchema>;

export const HistoryEntrySchema = z.object({
    room_id: z.string(),
    display_name: z.string(),
    finished_at: z.number(),
    gross_wpm: z.number(),
    net_wpm: z.number(),
    accuracy: z.number(),
    scaled_wpm: z.number(),
    chars_typed: z.number(),
    errors: z.number(),
});

export const PracticeRunRequestSchema = z.object({
    snippet_id: z.string().min(1),
    chars_typed: z.number().int().min(1),
    errors: z.number().int().min(0),
    duration_ms: z.number().int().min(1),
    save: z.boolean().optional().default(true),
});
export type PracticeRunRequest = z.infer<typeof PracticeRunRequestSchema>;

export const UserProfileSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  rating: z.number().int(),
  races_completed: z.number().int(),
  races_won: z.number().int(),
  best_wpm: z.record(z.string(), z.number()),
  created_at: z.number(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const RaceHistoryEntrySchema = z.object({
  room_id: z.string(),
  finished_at: z.number(),
  display_name: z.string(),
  language: z.string().optional(),
  scaled_wpm: z.number(),
  net_wpm: z.number(),
  gross_wpm: z.number(),
  accuracy: z.number(),
  rating_delta: z.number(),
  rating_after: z.number(),
});
export type RaceHistoryEntry = z.infer<typeof RaceHistoryEntrySchema>;

export const GetUserResponseSchema = z.object({
  profile: UserProfileSchema,
  recent: z.array(RaceHistoryEntrySchema.passthrough()),
});

export const LeaderboardEntrySchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  rating: z.number(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

export const GetLeaderboardResponseSchema = z.object({
  entries: z.array(LeaderboardEntrySchema),
});

export const PracticeRunResponseSchema = z.object({
    finished_at: z.number(),
    gross_wpm: z.number(),
    net_wpm: z.number(),
    accuracy: z.number(),
    scaled_wpm: z.number(),
    saved: z.boolean(),
});
export type PracticeRunResponse = z.infer<typeof PracticeRunResponseSchema>;
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const ListHistoryResponseSchema = z.object({
    results: z.array(HistoryEntrySchema.passthrough()),
});

export const WsCursorSchema = z.object({
    action: z.literal("cursor"),
    progress: z.number(),
    chars_typed: z.number().int(),
    errors: z.number().int().min(0),
});
export const WsPingSchema = z.object({ action: z.literal("ping") });
export const WsStartSchema = z.object({ action: z.literal("start") });
export const WsFinishSchema = z.object({
    action: z.literal("finish"),
    chars_typed: z.number().int().min(0),
    errors: z.number().int().min(0),
});

export const WsClientMsgSchema = z.discriminatedUnion("action", [
    WsCursorSchema,
    WsPingSchema,
    WsStartSchema,
    WsFinishSchema,
]);
export type WsClientMsg = z.infer<typeof WsClientMsgSchema>;

export const WsConnectQuerySchema = z.object({
    code: RoomCodeSchema,
    display_name: DisplayNameSchema,
    role: RoleSchema.optional().default("racer"),
});

export const WsServerCursorSchema = z.object({
    type: z.literal("cursor"),
    display_name: z.string(),
    progress: z.number(),
});
export const WsServerStartSchema = z.object({
    type: z.literal("start"),
    started_at: z.number(),
});
export const WsServerFinishSchema = z.object({
    type: z.literal("finish"),
    display_name: z.string(),
    gross_wpm: z.number(),
    net_wpm: z.number(),
    accuracy: z.number(),
    scaled_wpm: z.number(),
    finished_at: z.number(),
});
export const WsServerRoomEventSchema = z.object({
    type: z.literal("room-event"),
    event: z.enum(["join", "leave", "status"]),
    payload: z.unknown(),
});
export const WsServerRatingsSchema = z.object({
  type: z.literal("ratings"),
  entries: z.array(
    z.object({
      user_id: z.string(),
      display_name: z.string(),
      delta: z.number().int(),
      rating_after: z.number().int(),
    }),
  ),
});

export const WsServerKickedSchema = z.object({ type: z.literal("kicked") });
export const WsServerErrorSchema = z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
});

export const WsServerMsgSchema = z.discriminatedUnion("type", [
    WsServerCursorSchema,
    WsServerStartSchema,
    WsServerFinishSchema,
    WsServerRoomEventSchema,
    WsServerRatingsSchema,
    WsServerKickedSchema,
    WsServerErrorSchema,
]);
export type WsServerMsg = z.infer<typeof WsServerMsgSchema>;
