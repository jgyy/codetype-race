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
    telemetryMiddleware,
    type TeamRoomSink,
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
    .register(RemoveFriendCommand, new RemoveFriendHandler(friendsSink));

export const queryBus = new QueryBus()
    .use(telemetryMiddleware)
    .register(GetRoomQuery, new GetRoomHandler(rooms));

export {
    AcceptFriendRequestCommand,
    BlockUserCommand,
    ClaimQuestCommand,
    CreateRoomCommand,
    DailySubmitCommand,
    GetRoomQuery,
    JoinRoomCommand,
    PinAchievementsCommand,
    PracticeRunCommand,
    RemoveFriendCommand,
    ReviewSnippetCommand,
    SendFriendRequestCommand,
    SubmitSnippetCommand,
};
