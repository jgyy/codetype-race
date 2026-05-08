// @codetype/app — use-case layer.

export const APP_PACKAGE = "@codetype/app" as const;
export { DOMAIN_PACKAGE } from "@codetype/domain";

export {
    Command,
    Query,
    type CommandHandler,
    type QueryHandler,
    type ResultOf,
    CommandBus,
    QueryBus,
    type Middleware,
    type BusMessage,
    type Next,
    compose,
    telemetryMiddleware,
} from "./bus";

export {
    CreateRoomCommand,
    CreateRoomHandler,
    type CreateRoomInput,
    type CreateRoomResult,
    type CreateRoomTeam,
    type TeamRoomSink,
} from "./commands/CreateRoom";

export {
    GetRoomQuery,
    GetRoomHandler,
    type GetRoomResult,
} from "./queries/GetRoom";

export {
    GetLeaderboardQuery,
    GetLeaderboardHandler,
    type GetLeaderboardInput,
    type GetLeaderboardResult,
} from "./queries/GetLeaderboard";

export {
    JoinRoomCommand,
    JoinRoomHandler,
    type JoinRoomInput,
    type JoinRoomResult,
} from "./commands/JoinRoom";

export {
    ClaimQuestCommand,
    ClaimQuestHandler,
    type ClaimQuestInput,
    type ClaimQuestResult,
    type QuestDefLite,
    type QuestProgressLite,
    type QuestsSink,
} from "./commands/progression/ClaimQuest";

export {
    PinAchievementsCommand,
    PinAchievementsHandler,
    type PinAchievementsInput,
    type PinAchievementsResult,
    type AchievementsSink,
} from "./commands/progression/PinAchievements";

export {
    SubmitSnippetCommand,
    SubmitSnippetHandler,
    type SubmitSnippetInput,
    type SubmitSnippetResult,
    type SnippetSubmissionSink,
    type SnippetSubmissionPayload,
} from "./commands/snippets/SubmitSnippet";

export {
    ReviewSnippetCommand,
    ReviewSnippetHandler,
    type ReviewSnippetInput,
    type ReviewSnippetResult,
    type SnippetReviewSink,
    type ReviewDecision,
} from "./commands/snippets/ReviewSnippet";

export {
    DailySubmitCommand,
    DailySubmitHandler,
    type DailySubmitInput,
    type DailySubmitResult,
    type DailyRepoSink,
    type DailyRunRow,
    type UserDirectory,
} from "./commands/daily/DailySubmit";

export {
    PracticeRunCommand,
    PracticeRunHandler,
    type PracticeRunInput,
    type PracticeRunResult,
    type PracticeHistorySink,
} from "./commands/daily/PracticeRun";

export {
    SendFriendRequestCommand,
    SendFriendRequestHandler,
    AcceptFriendRequestCommand,
    AcceptFriendRequestHandler,
    BlockUserCommand,
    BlockUserHandler,
    RemoveFriendCommand,
    RemoveFriendHandler,
    type FriendActionInput,
    type FriendActionResult,
    type FriendActionStatus,
    type FriendsSink,
} from "./commands/social/Friends";

export {
    CreateGuildCommand,
    CreateGuildHandler,
    UpdateGuildCommand,
    UpdateGuildHandler,
    TransferGuildOwnershipCommand,
    TransferGuildOwnershipHandler,
    LeaveOrKickGuildMemberCommand,
    LeaveOrKickGuildMemberHandler,
    CreateGuildInviteCommand,
    CreateGuildInviteHandler,
    RedeemGuildInviteCommand,
    RedeemGuildInviteHandler,
    type CreateGuildInput,
    type UpdateGuildInput,
    type TransferGuildOwnershipInput,
    type TransferGuildOwnershipResult,
    type LeaveOrKickInput,
    type LeaveOrKickResult,
    type CreateGuildInviteInput,
    type CreateGuildInviteResult,
    type RedeemGuildInviteInput,
    type RedeemGuildInviteResult,
    type GuildLite,
    type GuildMemberLite,
    type GuildInviteLite,
    type GuildInviteRecord,
    type GuildRole,
    type GuildVisibility,
    type GuildUpdateInput,
    type GuildsSink,
} from "./commands/guilds/Guilds";

export {
    ConnectToRoomCommand,
    ConnectToRoomHandler,
    type ConnectToRoomInput,
} from "./commands/ws/ConnectToRoom";
export {
    DisconnectFromRoomCommand,
    DisconnectFromRoomHandler,
    type DisconnectFromRoomInput,
    type DisconnectFromRoomResult,
} from "./commands/ws/DisconnectFromRoom";
export {
    StartCountdownCommand,
    StartCountdownHandler,
    type StartCountdownInput,
} from "./commands/ws/StartCountdown";
export {
    HeartbeatCommand,
    HeartbeatHandler,
    type HeartbeatInput,
} from "./commands/ws/Heartbeat";
export {
    SendChatCommand,
    SendChatHandler,
    type SendChatInput,
} from "./commands/ws/SendChat";
export {
    FinishRaceCommand,
    FinishRaceHandler,
    type FinishRaceInput,
    type UserRatingsApplier,
    type UserProfileLite,
    type RaceResultInput,
    type AppliedDelta,
    type FeedAppender,
    type TeamRoomReader,
    type TeamLite,
    type TeamRatingApplier,
    type TeamRatingApplyItem,
    type TeamRatingRowLite,
    type RaceFinishedEmitter,
    type AntiCheatMetrics,
} from "./commands/ws/FinishRace";

export {
    CreateTournamentCommand,
    CreateTournamentHandler,
    RegisterForTournamentCommand,
    RegisterForTournamentHandler,
    SeedTournamentCommand,
    SeedTournamentHandler,
    WithdrawFromTournamentCommand,
    WithdrawFromTournamentHandler,
    CancelTournamentCommand,
    CancelTournamentHandler,
    type CreateTournamentInput,
    type CreateTournamentResult,
    type RegisterForTournamentInput,
    type RegisterForTournamentResult,
    type SeedTournamentInput,
    type SeedTournamentResult,
    type WithdrawFromTournamentInput,
    type WithdrawFromTournamentResult,
    type CancelTournamentInput,
    type CancelTournamentResult,
    type TournamentLite,
    type TournamentStatus,
    type TournamentEntrant,
    type BracketMatch,
    type TournamentsSink,
    type SeedingOrchestrator,
    type UserProfileLookup,
} from "./commands/tournaments/Tournaments";

export {
    GetRandomSnippetQuery,
    GetRandomSnippetHandler,
    ListPendingSnippetsQuery,
    ListPendingSnippetsHandler,
    GetStarterPackQuery,
    GetStarterPackHandler,
    GetDailyQuery,
    GetDailyHandler,
    GetDailyLeaderboardQuery,
    GetDailyLeaderboardHandler,
    type SnippetReadsSink,
    type SnippetFull,
    type DailyReadsSink,
    type DailyMeta,
    type DailyRunRow as DailyRunRowRead,
    type GetStarterPackInput,
    type GetDailyResult,
    type GetDailyLeaderboardResult,
} from "./queries/Snippets";

export {
    GetUserQuery,
    GetUserHandler,
    ListHistoryQuery,
    ListHistoryHandler,
    type UserReadsSink,
    type HistoryReadsSink,
    type UserProfile,
    type RaceHistoryEntry,
    type GetUserInput,
    type GetUserResult,
} from "./queries/Users";

export {
    GetReplayKeyQuery,
    GetReplayKeyHandler,
    type GetReplayKeyResult,
} from "./queries/Replay";

export {
    ReserveReplayUploadCommand,
    ReserveReplayUploadHandler,
    type ReserveReplayUploadInput,
    type ReserveReplayUploadResult,
} from "./commands/replay/ReserveReplayUpload";

export {
    GetGuildQuery,
    GetGuildHandler,
    ListGuildsQuery,
    ListGuildsHandler,
    ListGuildMembersQuery,
    ListGuildMembersHandler,
    GetGuildLeaderboardQuery,
    GetGuildLeaderboardHandler,
    type GuildReadsSink,
    type GuildVisibilityRow,
    type GuildMemberRow,
    type GetGuildResult,
    type ListGuildMembersInput,
    type ListGuildMembersResult,
    type GetGuildLeaderboardInput,
    type GetGuildLeaderboardResult,
    type GuildLeaderboardEntry,
} from "./queries/Guilds";

export {
    GetAchievementCatalogQuery,
    GetAchievementCatalogHandler,
    GetXpSummaryQuery,
    GetXpSummaryHandler,
    ListMyAchievementsQuery,
    ListMyAchievementsHandler,
    ListPublicAchievementsQuery,
    ListPublicAchievementsHandler,
    ListQuestsQuery,
    ListQuestsHandler,
    type AchievementsReadsSink,
    type XpReadsSink,
    type XpSummary,
    type QuestsReadsSink,
    type AchievementDef,
    type AchievementUnlock,
    type QuestDef,
    type QuestProgress,
    type CatalogItem,
    type GetXpSummaryResult,
    type MyAchievementItem,
    type PublicAchievementItem,
    type ListQuestsInput,
    type QuestItemOut,
} from "./queries/Progression";

export {
    GetFeedQuery,
    GetFeedHandler,
    ListFriendsQuery,
    ListFriendsHandler,
    ListFriendRequestsQuery,
    ListFriendRequestsHandler,
    SearchUsersQuery,
    SearchUsersHandler,
    type FeedReadsSink,
    type FriendsReadsSink,
    type PresenceSink,
    type FeedEvent,
    type FriendEdgeRow,
    type GetFeedInput,
    type ListFriendsInput,
    type FriendListEntry,
    type FriendRequestEntry,
    type UserSearchResultEntry,
} from "./queries/Social";

export {
    GetCurrentSeasonQuery,
    GetCurrentSeasonHandler,
    GetSeasonLeaderboardQuery,
    GetSeasonLeaderboardHandler,
    type SeasonsReadsSink,
    type SeasonRow,
    type GetSeasonLeaderboardInput,
} from "./queries/Seasons";

export {
    GetTournamentQuery,
    GetTournamentHandler,
    ListTournamentsQuery,
    ListTournamentsHandler,
    GetTournamentBracketQuery,
    GetTournamentBracketHandler,
    type TournamentReadsSink,
    type MatchReadsSink,
    type GetTournamentResult,
    type GetTournamentBracketResult,
} from "./queries/Tournaments";
