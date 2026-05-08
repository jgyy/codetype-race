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
    CommandBus,
    QueryBus,
    ClaimQuestCommand,
    ClaimQuestHandler,
    CreateRoomCommand,
    CreateRoomHandler,
    GetRoomQuery,
    GetRoomHandler,
    JoinRoomCommand,
    JoinRoomHandler,
    PinAchievementsCommand,
    PinAchievementsHandler,
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
    );

export const queryBus = new QueryBus()
    .use(telemetryMiddleware)
    .register(GetRoomQuery, new GetRoomHandler(rooms));

export {
    ClaimQuestCommand,
    CreateRoomCommand,
    GetRoomQuery,
    JoinRoomCommand,
    PinAchievementsCommand,
};
