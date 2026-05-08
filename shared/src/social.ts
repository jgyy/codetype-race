import { z } from "zod";

// Phase 10 — Social graph (friends + presence). Guilds, feed, and team
// races land in later slices and add to this module.

export const FriendStatusSchema = z.enum(["pending", "accepted", "blocked"]);
export type FriendStatus = z.infer<typeof FriendStatusSchema>;

export const FriendEdgeSchema = z.object({
    fromUserId: z.string(),
    toUserId: z.string(),
    status: FriendStatusSchema,
    createdAt: z.string().datetime(),
    acceptedAt: z.string().datetime().optional(),
});
export type FriendEdge = z.infer<typeof FriendEdgeSchema>;

// Presence is intentionally minimal: we never expose lastSeenAt to peers
// (anti-stalking). Public surface is just "online | offline".
export const PresenceStateSchema = z.enum(["online", "offline"]);
export type PresenceState = z.infer<typeof PresenceStateSchema>;

export const FriendSummarySchema = z.object({
    user_id: z.string(),
    display_name: z.string(),
    rating: z.number().int(),
    presence: PresenceStateSchema,
    accepted_at: z.string().datetime().optional(),
});
export type FriendSummary = z.infer<typeof FriendSummarySchema>;

export const FriendRequestSummarySchema = z.object({
    from_user_id: z.string(),
    display_name: z.string(),
    rating: z.number().int(),
    created_at: z.string().datetime(),
});
export type FriendRequestSummary = z.infer<typeof FriendRequestSummarySchema>;

export const ListFriendsResponseSchema = z.object({
    friends: z.array(FriendSummarySchema),
});

export const ListFriendRequestsResponseSchema = z.object({
    incoming: z.array(FriendRequestSummarySchema),
});

export const UserSearchHitSchema = z.object({
    user_id: z.string(),
    display_name: z.string(),
    rating: z.number().int(),
});
export const UserSearchResponseSchema = z.object({
    results: z.array(UserSearchHitSchema),
});
export const UserSearchQuerySchema = z
    .string()
    .min(3)
    .max(24)
    .regex(/^[A-Za-z0-9 _-]+$/);

export const FriendActionResponseSchema = z.object({
    status: FriendStatusSchema.or(z.literal("removed")),
});

// WebSocket schema additions for the presence channel. Independent from
// the room WS — see lambdas/ws/presence/*.
export const WsPresencePingSchema = z.object({ action: z.literal("ping") });
export const WsPresenceClientMsgSchema = z.discriminatedUnion("action", [
    WsPresencePingSchema,
]);

export const WsServerFriendOnlineSchema = z.object({
    type: z.literal("friend-online"),
    user_id: z.string(),
});
export const WsServerFriendOfflineSchema = z.object({
    type: z.literal("friend-offline"),
    user_id: z.string(),
});
export const WsServerPresenceMsgSchema = z.discriminatedUnion("type", [
    WsServerFriendOnlineSchema,
    WsServerFriendOfflineSchema,
]);
export type WsServerPresenceMsg = z.infer<typeof WsServerPresenceMsgSchema>;
