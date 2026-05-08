import { z } from "zod";

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

export const TeamIdSchema = z.enum(["A", "B", "C", "D"]);
export type TeamId = z.infer<typeof TeamIdSchema>;

export const TeamSchema = z.object({
    id: TeamIdSchema,
    name: z.string().min(1).max(24),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    members: z.array(z.string()).min(1).max(2),
});
export type Team = z.infer<typeof TeamSchema>;

export const TeamRoomConfigSchema = z.object({
    mode: z.literal("team"),
    teams: z.array(TeamSchema).min(2).max(4),
    rated: z.boolean().default(true),
});
export type TeamRoomConfig = z.infer<typeof TeamRoomConfigSchema>;

export const TeamRatingSchema = z.object({
    user_id: z.string(),
    language: z.string(),
    rating: z.number().int(),
    games: z.number().int().nonnegative(),
});
export type TeamRating = z.infer<typeof TeamRatingSchema>;

export const TEAM_STARTING_RATING = 1000;
export const TEAM_ELO_K = 24;
export const TEAM_SIZE_BONUS = 50;

// ─── Activity feed ──────────────────────────────────────────────────
export const FeedEventTypeSchema = z.enum([
    "raced",
    "joined_guild",
    "left_guild",
    "won_tournament",
    "daily_completed",
    "achievement_unlocked",
    "pb_set",
]);
export type FeedEventType = z.infer<typeof FeedEventTypeSchema>;

export const FeedEventSchema = z.object({
    user_id: z.string(),
    event_id: z.string().uuid(),
    type: FeedEventTypeSchema,
    payload: z.record(z.unknown()),
    created_at: z.string().datetime(),
});
export type FeedEvent = z.infer<typeof FeedEventSchema>;

export const FeedResponseSchema = z.object({
    events: z.array(FeedEventSchema),
});

export const FEED_PAGE_SIZE = 50;
