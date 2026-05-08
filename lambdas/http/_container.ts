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
    CreateRoomCommand,
    CreateRoomHandler,
    GetRoomQuery,
    GetRoomHandler,
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
    );

export const queryBus = new QueryBus()
    .use(telemetryMiddleware)
    .register(GetRoomQuery, new GetRoomHandler(rooms));

export { CreateRoomCommand, GetRoomQuery };
