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

// ─── Guilds ─────────────────────────────────────────────────────────
export const GuildVisibilitySchema = z.enum(["public", "private"]);
export type GuildVisibility = z.infer<typeof GuildVisibilitySchema>;

export const GuildRoleSchema = z.enum(["owner", "mod", "member"]);
export type GuildRole = z.infer<typeof GuildRoleSchema>;

export const GuildSlugSchema = z
    .string()
    .regex(/^[a-z0-9-]{3,32}$/, "slug must be 3-32 chars, lowercase/digits/dashes");

export const GuildNameSchema = z.string().min(3).max(32);

export const GuildSchema = z.object({
    id: z.string().uuid(),
    name: GuildNameSchema,
    slug: GuildSlugSchema,
    visibility: GuildVisibilitySchema,
    ownerId: z.string(),
    description: z.string().max(500).default(""),
    memberCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
});
export type Guild = z.infer<typeof GuildSchema>;

export const GuildMemberSchema = z.object({
    guildId: z.string().uuid(),
    userId: z.string(),
    role: GuildRoleSchema,
    joinedAt: z.string().datetime(),
});
export type GuildMember = z.infer<typeof GuildMemberSchema>;

export const GuildInviteSchema = z.object({
    guildId: z.string().uuid(),
    code: z.string().min(6).max(16),
    createdBy: z.string(),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
});
export type GuildInvite = z.infer<typeof GuildInviteSchema>;

export const CreateGuildRequestSchema = z.object({
    name: GuildNameSchema,
    slug: GuildSlugSchema,
    visibility: GuildVisibilitySchema,
    description: z.string().max(500).optional(),
});

export const UpdateGuildRequestSchema = z
    .object({
        name: GuildNameSchema.optional(),
        description: z.string().max(500).optional(),
        visibility: GuildVisibilitySchema.optional(),
    })
    .refine(
        (v) => Object.keys(v).length > 0,
        "at least one field is required",
    );

export const TransferGuildRequestSchema = z.object({
    new_owner_id: z.string(),
});

export const ListGuildsResponseSchema = z.object({
    guilds: z.array(GuildSchema),
});

export const GuildDetailResponseSchema = z.object({
    guild: GuildSchema,
    viewer_role: GuildRoleSchema.nullable(),
});

export const GuildMemberSummarySchema = z.object({
    user_id: z.string(),
    display_name: z.string(),
    rating: z.number().int(),
    role: GuildRoleSchema,
    joined_at: z.string().datetime(),
});
export type GuildMemberSummary = z.infer<typeof GuildMemberSummarySchema>;

export const GuildMembersResponseSchema = z.object({
    members: z.array(GuildMemberSummarySchema),
});

export const GuildLeaderboardEntrySchema = z.object({
    user_id: z.string(),
    display_name: z.string(),
    rating: z.number().int(),
    rank: z.number().int().min(1),
});
export const GuildLeaderboardResponseSchema = z.object({
    guild_id: z.string().uuid(),
    language: z.string(),
    entries: z.array(GuildLeaderboardEntrySchema),
});

export const CreateInviteResponseSchema = z.object({
    code: z.string(),
    expires_at: z.string().datetime(),
});

export const RedeemInviteResponseSchema = z.object({
    guild_id: z.string().uuid(),
    role: GuildRoleSchema,
});

export const GUILD_MIN_MEMBERS = 1;
export const GUILD_MAX_MEMBERS = 50;
export const INVITE_TTL_SECONDS = 7 * 24 * 3600;
