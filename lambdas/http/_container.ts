import {
    AcceptFriendRequestCommand,
    AcceptFriendRequestHandler,
    BlockUserCommand,
    BlockUserHandler,
    ClaimQuestCommand,
    ClaimQuestHandler,
    CommandBus,
    CreateRoomCommand,
    CreateRoomHandler,
    DailySubmitCommand,
    DailySubmitHandler,
    GetLeaderboardQuery,
    GetLeaderboardHandler,
    GetRoomQuery,
    GetRoomHandler,
    JoinRoomCommand,
    JoinRoomHandler,
    PinAchievementsCommand,
    PinAchievementsHandler,
    PracticeRunCommand,
    PracticeRunHandler,
    QueryBus,
    RemoveFriendCommand,
    RemoveFriendHandler,
    ReviewSnippetCommand,
    ReviewSnippetHandler,
    SendFriendRequestCommand,
    SendFriendRequestHandler,
    SubmitSnippetCommand,
    SubmitSnippetHandler,
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
    GetUserQuery,
    GetUserHandler,
    ListHistoryQuery,
    ListHistoryHandler,
    GetReplayKeyQuery,
    GetReplayKeyHandler,
    ReserveReplayUploadCommand,
    ReserveReplayUploadHandler,
    GetGuildQuery,
    GetGuildHandler,
    ListGuildsQuery,
    ListGuildsHandler,
    ListGuildMembersQuery,
    ListGuildMembersHandler,
    GetGuildLeaderboardQuery,
    GetGuildLeaderboardHandler,
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
    GetFeedQuery,
    GetFeedHandler,
    ListFriendsQuery,
    ListFriendsHandler,
    ListFriendRequestsQuery,
    ListFriendRequestsHandler,
    SearchUsersQuery,
    SearchUsersHandler,
    GetCurrentSeasonQuery,
    GetCurrentSeasonHandler,
    GetSeasonLeaderboardQuery,
    GetSeasonLeaderboardHandler,
    GetTournamentQuery,
    GetTournamentHandler,
    ListTournamentsQuery,
    ListTournamentsHandler,
    GetTournamentBracketQuery,
    GetTournamentBracketHandler,
    createTelemetryMiddleware,
    type AchievementsReadsSink,
    type DailyReadsSink,
    type FeedReadsSink,
    type FriendsReadsSink,
    type GuildReadsSink,
    type GuildsSink,
    type HistoryReadsSink,
    type MatchReadsSink,
    type PresenceSink,
    type QuestsReadsSink,
    type SeasonsReadsSink,
    type SeedingOrchestrator,
    type SnippetReadsSink,
    type TeamRoomSink,
    type TournamentReadsSink,
    type TournamentsSink,
    type UserProfileLookup,
    type UserReadsSink,
    type XpReadsSink,
} from "@codetype/app";
import {
    CryptoRandom,
    DdbLeaderboardProjection,
    DdbRoomRepo,
    DdbSnippetRepo,
    SystemClock,
} from "@codetype/adapters-aws";
import { ddb, TABLE } from "../src/ddb";
import { tracer as otelTracer, metrics as otelMetrics } from "../src/otel";
import { teamRooms } from "../src/repos/TeamRoomRepo";
import { quests } from "../src/repos/QuestsRepo";
import { achievements } from "../src/repos/AchievementsRepo";
import { snippets as snippetsLegacy } from "../src/repos/SnippetRepo";
import { daily } from "../src/repos/DailyRepo";
import { history } from "../src/repos/HistoryRepo";
import { users } from "../src/repos/UserRepo";
import { friends } from "../src/repos/FriendsRepo";
import { guilds as guildsRepo } from "../src/repos/GuildRepo";
import { feed } from "../src/repos/FeedRepo";
import { tournaments as tournamentsRepo } from "../src/repos/TournamentRepo";
import { matches as matchesRepo } from "../src/repos/MatchRepo";
import { seedTournament } from "../src/orchestration/seedTournament";
import { xp } from "../src/repos/XpRepo";
import { seasons as seasonsRepo } from "../src/repos/SeasonRepo";
import { presence } from "../src/repos/PresenceRepo";

const clock = new SystemClock();
const random = new CryptoRandom();
const rooms = new DdbRoomRepo({ table: TABLE, client: ddb });
const snippets = new DdbSnippetRepo({ table: TABLE, client: ddb });
const leaderboard = new DdbLeaderboardProjection({ table: TABLE, client: ddb });

const teamRoomSink: TeamRoomSink = {
    putTeams: (roomId, teams) => teamRooms.putTeams(roomId, teams),
};

const friendsSink = {
    sendRequest: (a: string, b: string) => friends.sendRequest(a, b),
    accept: (a: string, b: string) => friends.accept(a, b),
    block: (a: string, b: string) => friends.block(a, b),
    remove: (a: string, b: string) => friends.remove(a, b),
};

const guildsSink: GuildsSink = {
    create: (g) => guildsRepo.create(g),
    get: (id) => guildsRepo.get(id) as ReturnType<GuildsSink["get"]>,
    update: (id, input, prev) =>
        guildsRepo.update(id, input, prev) as ReturnType<GuildsSink["update"]>,
    getMember: (id, uid) =>
        guildsRepo.getMember(id, uid) as ReturnType<GuildsSink["getMember"]>,
    removeMember: (id, uid) => guildsRepo.removeMember(id, uid),
    transferOwnership: (id, from, to) =>
        guildsRepo.transferOwnership(id, from, to),
    addMember: (id, uid, role, ts) =>
        guildsRepo.addMember(id, uid, role, ts),
    createInvite: (id, code, by) => guildsRepo.createInvite(id, code, by),
    findInviteByCode: (code) =>
        guildsRepo.findInviteByCode(code) as ReturnType<
            GuildsSink["findInviteByCode"]
        >,
};

const feedSink = {
    append: (userId: string, type: string, payload: Record<string, unknown>) =>
        feed.append(userId, type as Parameters<typeof feed.append>[1], payload),
};

const tournamentsSink: TournamentsSink = {
    create: (t) => tournamentsRepo.create(t),
    get: (id) => tournamentsRepo.get(id) as ReturnType<TournamentsSink["get"]>,
    transitionStatus: (id, from, to) =>
        tournamentsRepo.transitionStatus(id, from, to),
    addEntrant: (e) => tournamentsRepo.addEntrant(e),
    removeEntrant: (id, uid) => tournamentsRepo.removeEntrant(id, uid),
    listEntrants: (id) =>
        tournamentsRepo.listEntrants(id) as ReturnType<
            TournamentsSink["listEntrants"]
        >,
};

const seedingOrchestrator: SeedingOrchestrator = {
    seed: ({ tournId, size, startsAt }) =>
        seedTournament({
            tournId,
            size,
            startsAt,
            matches: matchesRepo,
            tournaments: tournamentsRepo,
        }),
};

const userProfileLookup: UserProfileLookup = {
    getProfile: (uid) =>
        users.getProfile(uid) as ReturnType<UserProfileLookup["getProfile"]>,
};

/* -------- 13.5b read sinks -------- */

const snippetReads: SnippetReadsSink = {
    getById: (id) =>
        snippetsLegacy.getById(id) as ReturnType<SnippetReadsSink["getById"]>,
    list: (filters, limit) =>
        snippetsLegacy.list(filters, limit) as ReturnType<SnippetReadsSink["list"]>,
    listPending: (limit) =>
        snippetsLegacy.listPending(limit) as ReturnType<SnippetReadsSink["listPending"]>,
    random: (filters) =>
        snippetsLegacy.random(filters) as ReturnType<SnippetReadsSink["random"]>,
};

const dailyReads: DailyReadsSink = {
    getMeta: (date) => daily.getMeta(date) as ReturnType<DailyReadsSink["getMeta"]>,
    listRuns: (date, limit) =>
        daily.listRuns(date, limit) as ReturnType<DailyReadsSink["listRuns"]>,
};

const userReads: UserReadsSink = {
    getProfile: (uid) =>
        users.getProfile(uid) as ReturnType<UserReadsSink["getProfile"]>,
    listRecentRaces: (uid, limit) =>
        users.listRecentRaces(uid, limit) as ReturnType<UserReadsSink["listRecentRaces"]>,
    getOrCreate: (uid, name) =>
        users.getOrCreate(uid, name) as ReturnType<UserReadsSink["getOrCreate"]>,
    searchByHandlePrefix: (prefix, limit) =>
        users.searchByHandlePrefix(prefix, limit) as ReturnType<
            UserReadsSink["searchByHandlePrefix"]
        >,
};

const historyReads: HistoryReadsSink = {
    listForHost: (uid) =>
        history.listForHost(uid) as ReturnType<HistoryReadsSink["listForHost"]>,
};

const guildReads: GuildReadsSink = {
    get: (id) =>
        guildsRepo.get(id) as ReturnType<GuildReadsSink["get"]>,
    getMember: (id, uid) =>
        guildsRepo.getMember(id, uid) as ReturnType<GuildReadsSink["getMember"]>,
    listMembers: (id) =>
        guildsRepo.listMembers(id) as ReturnType<GuildReadsSink["listMembers"]>,
    discoverPublic: (q, limit) => guildsRepo.discoverPublic(q, limit),
};

const achievementsReads: AchievementsReadsSink = {
    listForUser: (uid) =>
        achievements.listForUser(uid) as ReturnType<AchievementsReadsSink["listForUser"]>,
    listPinned: (uid) => achievements.listPinned(uid),
};

const xpReads: XpReadsSink = {
    getSummary: (uid) =>
        xp.getSummary(uid) as ReturnType<XpReadsSink["getSummary"]>,
};

const questsReads: QuestsReadsSink = {
    listActive: (period, rotationId) =>
        quests.listActive(period, rotationId) as ReturnType<QuestsReadsSink["listActive"]>,
    getProgressMap: (uid, rotationId) =>
        quests.getProgressMap(uid, rotationId) as ReturnType<
            QuestsReadsSink["getProgressMap"]
        >,
};

const friendsReads: FriendsReadsSink = {
    getEdge: (a, b) =>
        friends.getEdge(a, b) as ReturnType<FriendsReadsSink["getEdge"]>,
    listFriends: (uid) =>
        friends.listFriends(uid) as ReturnType<FriendsReadsSink["listFriends"]>,
    listIncomingRequests: (uid) =>
        friends.listIncomingRequests(uid) as ReturnType<
            FriendsReadsSink["listIncomingRequests"]
        >,
};

const feedReads: FeedReadsSink = {
    list: (uid) => feed.list(uid) as ReturnType<FeedReadsSink["list"]>,
};

const presenceSink: PresenceSink = {
    whichOnline: (ids) => presence.whichOnline(ids),
};

const seasonsReads: SeasonsReadsSink = {
    listByStatus: (status) =>
        seasonsRepo.listByStatus(status) as ReturnType<SeasonsReadsSink["listByStatus"]>,
    get: (id) => seasonsRepo.get(id) as ReturnType<SeasonsReadsSink["get"]>,
    getLeaderboard: (id, lang, limit) =>
        seasonsRepo.getLeaderboard(id, lang, limit),
};

const tournamentReads: TournamentReadsSink = {
    listByStatus: (status) =>
        tournamentsRepo.listByStatus(status) as ReturnType<
            TournamentReadsSink["listByStatus"]
        >,
};

const matchReads: MatchReadsSink = {
    listAll: (id) => matchesRepo.listAll(id),
};

export const commandBus = new CommandBus()
    .use(
        createTelemetryMiddleware({
            tracer: otelTracer,
            metrics: otelMetrics,
            kind: "command",
        }),
    )
    .register(
        CreateRoomCommand,
        new CreateRoomHandler(rooms, snippets, clock, random, teamRoomSink),
    )
    .register(JoinRoomCommand, new JoinRoomHandler(rooms, clock))
    .register(
        ClaimQuestCommand,
        new ClaimQuestHandler({
            getProgress: (u, r, q) => quests.getProgress(u, r, q),
            claim: (u, r, def) => quests.claim(u, r, def),
        }),
    )
    .register(
        PinAchievementsCommand,
        new PinAchievementsHandler({
            listForUser: (u) => achievements.listForUser(u),
            setPinned: (u, s) => achievements.setPinned(u, s),
        }),
    )
    .register(
        SubmitSnippetCommand,
        new SubmitSnippetHandler(
            {
                incrementDailySubmitCounter: (u, d, l) =>
                    snippetsLegacy.incrementDailySubmitCounter(u, d, l),
                submitPending: (id, by, sub) =>
                    snippetsLegacy.submitPending(id, by, sub),
            },
            random,
        ),
    )
    .register(
        ReviewSnippetCommand,
        new ReviewSnippetHandler({
            approveOrReject: (id, by, dec, reason) =>
                snippetsLegacy.approveOrReject(id, by, dec, reason),
        }),
    )
    .register(
        DailySubmitCommand,
        new DailySubmitHandler(
            snippets,
            { getOrCreate: (uid, name) => users.getOrCreate(uid, name) },
            {
                submitBest: (date, uid, name, wpm) =>
                    daily.submitBest(date, uid, name, wpm),
                listRuns: (date, limit) => daily.listRuns(date, limit),
            },
        ),
    )
    .register(
        PracticeRunCommand,
        new PracticeRunHandler(
            snippets,
            { appendPractice: (row) => history.appendPractice(row) },
            clock,
        ),
    )
    .register(
        SendFriendRequestCommand,
        new SendFriendRequestHandler(friendsSink),
    )
    .register(
        AcceptFriendRequestCommand,
        new AcceptFriendRequestHandler(friendsSink),
    )
    .register(BlockUserCommand, new BlockUserHandler(friendsSink))
    .register(RemoveFriendCommand, new RemoveFriendHandler(friendsSink))
    .register(CreateGuildCommand, new CreateGuildHandler(guildsSink, random))
    .register(UpdateGuildCommand, new UpdateGuildHandler(guildsSink))
    .register(
        TransferGuildOwnershipCommand,
        new TransferGuildOwnershipHandler(guildsSink),
    )
    .register(
        LeaveOrKickGuildMemberCommand,
        new LeaveOrKickGuildMemberHandler(guildsSink, feedSink),
    )
    .register(
        CreateGuildInviteCommand,
        new CreateGuildInviteHandler(guildsSink),
    )
    .register(
        RedeemGuildInviteCommand,
        new RedeemGuildInviteHandler(guildsSink, feedSink),
    )
    .register(
        CreateTournamentCommand,
        new CreateTournamentHandler(tournamentsSink, random),
    )
    .register(
        RegisterForTournamentCommand,
        new RegisterForTournamentHandler(tournamentsSink, userProfileLookup, clock),
    )
    .register(
        SeedTournamentCommand,
        new SeedTournamentHandler(tournamentsSink, seedingOrchestrator),
    )
    .register(
        WithdrawFromTournamentCommand,
        new WithdrawFromTournamentHandler(tournamentsSink),
    )
    .register(
        CancelTournamentCommand,
        new CancelTournamentHandler(tournamentsSink),
    )
    .register(
        ReserveReplayUploadCommand,
        new ReserveReplayUploadHandler(rooms),
    );

export const queryBus = new QueryBus()
    .use(
        createTelemetryMiddleware({
            tracer: otelTracer,
            metrics: otelMetrics,
            kind: "query",
        }),
    )
    .register(GetRoomQuery, new GetRoomHandler(rooms))
    .register(GetLeaderboardQuery, new GetLeaderboardHandler(leaderboard))
    .register(
        GetRandomSnippetQuery,
        new GetRandomSnippetHandler(snippetReads),
    )
    .register(
        ListPendingSnippetsQuery,
        new ListPendingSnippetsHandler(snippetReads),
    )
    .register(
        GetStarterPackQuery,
        new GetStarterPackHandler(snippetReads),
    )
    .register(GetDailyQuery, new GetDailyHandler(dailyReads, snippetReads))
    .register(
        GetDailyLeaderboardQuery,
        new GetDailyLeaderboardHandler(dailyReads),
    )
    .register(GetUserQuery, new GetUserHandler(userReads))
    .register(ListHistoryQuery, new ListHistoryHandler(historyReads))
    .register(GetReplayKeyQuery, new GetReplayKeyHandler(rooms))
    .register(GetGuildQuery, new GetGuildHandler(guildReads))
    .register(ListGuildsQuery, new ListGuildsHandler(guildReads))
    .register(
        ListGuildMembersQuery,
        new ListGuildMembersHandler(guildReads, userReads),
    )
    .register(
        GetGuildLeaderboardQuery,
        new GetGuildLeaderboardHandler(guildReads, userReads),
    )
    .register(
        GetAchievementCatalogQuery,
        new GetAchievementCatalogHandler(),
    )
    .register(GetXpSummaryQuery, new GetXpSummaryHandler(xpReads))
    .register(
        ListMyAchievementsQuery,
        new ListMyAchievementsHandler(achievementsReads),
    )
    .register(
        ListPublicAchievementsQuery,
        new ListPublicAchievementsHandler(achievementsReads),
    )
    .register(ListQuestsQuery, new ListQuestsHandler(questsReads))
    .register(
        GetFeedQuery,
        new GetFeedHandler(feedReads, friendsReads, guildReads),
    )
    .register(
        ListFriendsQuery,
        new ListFriendsHandler(friendsReads, userReads, presenceSink),
    )
    .register(
        ListFriendRequestsQuery,
        new ListFriendRequestsHandler(friendsReads, userReads),
    )
    .register(SearchUsersQuery, new SearchUsersHandler(userReads))
    .register(
        GetCurrentSeasonQuery,
        new GetCurrentSeasonHandler(seasonsReads),
    )
    .register(
        GetSeasonLeaderboardQuery,
        new GetSeasonLeaderboardHandler(seasonsReads),
    )
    .register(GetTournamentQuery, new GetTournamentHandler(tournamentsSink))
    .register(
        ListTournamentsQuery,
        new ListTournamentsHandler(tournamentReads),
    )
    .register(
        GetTournamentBracketQuery,
        new GetTournamentBracketHandler(tournamentsSink, matchReads),
    );

export {
    AcceptFriendRequestCommand,
    BlockUserCommand,
    ClaimQuestCommand,
    CreateGuildCommand,
    CreateGuildInviteCommand,
    CreateRoomCommand,
    DailySubmitCommand,
    GetLeaderboardQuery,
    GetRoomQuery,
    JoinRoomCommand,
    LeaveOrKickGuildMemberCommand,
    PinAchievementsCommand,
    PracticeRunCommand,
    RedeemGuildInviteCommand,
    RemoveFriendCommand,
    ReviewSnippetCommand,
    SendFriendRequestCommand,
    SubmitSnippetCommand,
    TransferGuildOwnershipCommand,
    UpdateGuildCommand,
    CreateTournamentCommand,
    RegisterForTournamentCommand,
    SeedTournamentCommand,
    WithdrawFromTournamentCommand,
    CancelTournamentCommand,
    ReserveReplayUploadCommand,
    GetRandomSnippetQuery,
    ListPendingSnippetsQuery,
    GetStarterPackQuery,
    GetDailyQuery,
    GetDailyLeaderboardQuery,
    GetUserQuery,
    ListHistoryQuery,
    GetReplayKeyQuery,
    GetGuildQuery,
    ListGuildsQuery,
    ListGuildMembersQuery,
    GetGuildLeaderboardQuery,
    GetAchievementCatalogQuery,
    GetXpSummaryQuery,
    ListMyAchievementsQuery,
    ListPublicAchievementsQuery,
    ListQuestsQuery,
    GetFeedQuery,
    ListFriendsQuery,
    ListFriendRequestsQuery,
    SearchUsersQuery,
    GetCurrentSeasonQuery,
    GetSeasonLeaderboardQuery,
    GetTournamentQuery,
    ListTournamentsQuery,
    GetTournamentBracketQuery,
};
