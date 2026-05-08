/**
 * Per-Lambda container — wires ports → adapters and registers
 * commands/queries on the in-process buses.
 *
 * Module-scope: initialised exactly once per cold start, then reused
 * across warm invocations. Cold-start budget impact target: <30 ms.
 *
 * Slice 13.3 wires only the room-create / room-get pilot. Future
 * slices append more registrations to the same buses.
 */

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
    telemetryMiddleware,
    type GuildsSink,
    type SeedingOrchestrator,
    type TeamRoomSink,
    type TournamentsSink,
    type UserProfileLookup,
} from "@codetype/app";
import {
    CryptoRandom,
    DdbRoomRepo,
    DdbSnippetRepo,
    SystemClock,
} from "@codetype/adapters-aws";
import { ddb, TABLE } from "../src/ddb";
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

const clock = new SystemClock();
const random = new CryptoRandom();
const rooms = new DdbRoomRepo({ table: TABLE, client: ddb });
const snippets = new DdbSnippetRepo({ table: TABLE, client: ddb });

// TeamRoomSink is implemented by the legacy TeamRoomRepo until slice
// 13.4 migrates the team domain. The sink shape is intentionally
// narrow so the legacy repo satisfies it as-is.
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

export const commandBus = new CommandBus()
    .use(telemetryMiddleware)
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
    );

export const queryBus = new QueryBus()
    .use(telemetryMiddleware)
    .register(GetRoomQuery, new GetRoomHandler(rooms));

export {
    AcceptFriendRequestCommand,
    BlockUserCommand,
    ClaimQuestCommand,
    CreateGuildCommand,
    CreateGuildInviteCommand,
    CreateRoomCommand,
    DailySubmitCommand,
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
};
