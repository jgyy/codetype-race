import { z } from "zod";

export const SeasonStatusSchema = z.enum([
    "upcoming",
    "active",
    "finalizing",
    "archived",
]);
export type SeasonStatus = z.infer<typeof SeasonStatusSchema>;

export const SeasonIdSchema = z.string().regex(/^[0-9]{4}-S[0-9]$/);

export const SeasonSchema = z.object({
    id: SeasonIdSchema,
    status: SeasonStatusSchema,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    decayFactor: z.number().min(0).max(1).default(0.25),
    decayTarget: z.number().int().default(1200),
});
export type Season = z.infer<typeof SeasonSchema>;

export const SeasonLeaderboardRowSchema = z.object({
    seasonId: SeasonIdSchema,
    language: z.string(),
    rank: z.number().int().positive(),
    userId: z.string(),
    displayName: z.string(),
    rating: z.number().int(),
    racesPlayed: z.number().int().nonnegative(),
});
export type SeasonLeaderboardRow = z.infer<typeof SeasonLeaderboardRowSchema>;

export const TournamentStatusSchema = z.enum([
    "registering",
    "seeding",
    "running",
    "finished",
    "cancelled",
]);
export type TournamentStatus = z.infer<typeof TournamentStatusSchema>;

export const TournamentSizeSchema = z.union([
    z.literal(4),
    z.literal(8),
    z.literal(16),
    z.literal(32),
    z.literal(64),
]);
export type TournamentSize = z.infer<typeof TournamentSizeSchema>;

export const TournamentSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(3).max(64),
    size: TournamentSizeSchema,
    language: z.string().default("*"),
    difficulty: z.enum(["easy", "medium", "hard", "any"]).default("any"),
    status: TournamentStatusSchema,
    startsAt: z.string().datetime(),
    registrationClosesAt: z.string().datetime(),
    seasonId: SeasonIdSchema,
    hostId: z.string(),
    createdAt: z.string().datetime(),
    winnerId: z.string().nullable().default(null),
});
export type Tournament = z.infer<typeof TournamentSchema>;

export const TournamentEntrantSchema = z.object({
    tournId: z.string().uuid(),
    userId: z.string(),
    displayName: z.string(),
    seedRank: z.number().int().positive().nullable(),
    snapshotRating: z.number().int(),
    registeredAt: z.string().datetime(),
    eliminatedAt: z.string().datetime().nullable().default(null),
    dq: z.boolean().default(false),
});
export type TournamentEntrant = z.infer<typeof TournamentEntrantSchema>;

export const MatchStatusSchema = z.enum([
    "pending",
    "live",
    "done",
    "bye",
    "flagged",
]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const TournamentMatchSchema = z.object({
    tournId: z.string().uuid(),
    round: z.number().int().nonnegative(),
    slot: z.number().int().nonnegative(),
    status: MatchStatusSchema,
    players: z.tuple([z.string().nullable(), z.string().nullable()]),
    winnerId: z.string().nullable(),
    roomId: z.string().nullable(),
    scheduledAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable().default(null),
    flagged: z.boolean().default(false),
});
export type TournamentMatch = z.infer<typeof TournamentMatchSchema>;

export const BracketWsServerSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("BRACKET_INIT"),
        tournId: z.string().uuid(),
        matches: z.array(TournamentMatchSchema),
    }),
    z.object({
        type: z.literal("BRACKET_UPDATE"),
        tournId: z.string().uuid(),
        match: TournamentMatchSchema,
    }),
    z.object({
        type: z.literal("MATCH_READY"),
        tournId: z.string().uuid(),
        roomId: z.string(),
        opensInMs: z.number().int().nonnegative(),
        round: z.number().int().nonnegative(),
        slot: z.number().int().nonnegative(),
    }),
    z.object({
        type: z.literal("MATCH_DONE"),
        tournId: z.string().uuid(),
        round: z.number().int().nonnegative(),
        slot: z.number().int().nonnegative(),
        winnerId: z.string(),
    }),
    z.object({
        type: z.literal("TOURNAMENT_FINISHED"),
        tournId: z.string().uuid(),
        winnerId: z.string(),
    }),
]);
export type BracketWsServerMessage = z.infer<typeof BracketWsServerSchema>;

export const BracketWsClientSchema = z.object({
    type: z.literal("HEARTBEAT"),
});
export type BracketWsClientMessage = z.infer<typeof BracketWsClientSchema>;

export const CreateTournamentRequestSchema = z.object({
    name: z.string().min(3).max(64),
    size: TournamentSizeSchema,
    language: z.string().default("*"),
    difficulty: z.enum(["easy", "medium", "hard", "any"]).default("any"),
    startsAt: z.string().datetime(),
    registrationClosesAt: z.string().datetime(),
    seasonId: SeasonIdSchema,
});
export type CreateTournamentRequest = z.infer<
    typeof CreateTournamentRequestSchema
>;

export const CreateTournamentResponseSchema = z.object({
    id: z.string().uuid(),
});

export const ListTournamentsResponseSchema = z.object({
    tournaments: z.array(TournamentSchema),
});

export const GetTournamentResponseSchema = TournamentSchema.extend({
    entrantCount: z.number().int().nonnegative(),
});

export const BracketResponseSchema = z.object({
    tournId: z.string().uuid(),
    size: TournamentSizeSchema,
    matches: z.array(TournamentMatchSchema),
});

export const RegisterResponseSchema = z.object({
    ok: z.literal(true),
    seedSnapshot: z.number().int(),
});

export const CurrentSeasonResponseSchema = z.object({
    season: SeasonSchema.nullable(),
    daysRemaining: z.number().int().nonnegative().nullable(),
});

export const TournWsConnectQuerySchema = z.object({
    tournId: z.string().uuid(),
    userId: z.string().optional(),
});
export type TournWsConnectQuery = z.infer<typeof TournWsConnectQuerySchema>;

export const SeasonLeaderboardResponseSchema = z.object({
    seasonId: SeasonIdSchema,
    language: z.string(),
    rows: z.array(SeasonLeaderboardRowSchema),
});
