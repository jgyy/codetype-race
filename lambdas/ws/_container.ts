import {
    CommandBus,
    ConnectToRoomCommand,
    ConnectToRoomHandler,
    DisconnectFromRoomCommand,
    DisconnectFromRoomHandler,
    FinishRaceCommand,
    FinishRaceHandler,
    HeartbeatCommand,
    HeartbeatHandler,
    SendChatCommand,
    SendChatHandler,
    StartCountdownCommand,
    StartCountdownHandler,
    telemetryMiddleware,
} from "@codetype/app";
import {
    ApiGwBroadcaster,
    DdbConnectionRepo,
    DdbRoomRepo,
    DdbSnippetRepo,
    SystemClock,
} from "@codetype/adapters-aws";
import { userPK, userRaceSK } from "@codetype/shared/ddb-keys";
import { ddb, TABLE } from "../src/ddb";
import { metrics } from "../src/metrics";
import { users } from "../src/repos/UserRepo";
import { teamRatings } from "../src/repos/TeamRatingRepo";
import { teamRooms } from "../src/repos/TeamRoomRepo";
import { feed } from "../src/repos/FeedRepo";

const clock = new SystemClock();
const rooms = new DdbRoomRepo({ table: TABLE, client: ddb });
const connections = new DdbConnectionRepo({ table: TABLE, client: ddb });
const snippets = new DdbSnippetRepo({ table: TABLE, client: ddb });
const broadcaster = new ApiGwBroadcaster({
    endpoint: process.env.WS_ENDPOINT ?? "",
});

// Sinks for the FinishRace command — narrow interfaces in @codetype/app
// satisfied structurally by the legacy repos. They retain AWS coupling
// and will be promoted to full domain ports in later slices when their
// aggregates migrate.
const finishMetrics = {
    onFlag: (code: string) => metrics.antiCheatFlag(code),
    emitRaceFinished: (_roomId: string, _ts: number, durationMs: number) =>
        metrics.raceFinished(durationMs),
};

const buildTeamHistoryItems: ConstructorParameters<
    typeof FinishRaceHandler
>[10] = ({ roomId, language, now, rated, teamOf, winnerId }) => [
    {
        Update: {
            TableName: TABLE,
            Key: { PK: `ROOM#${roomId}`, SK: "META" },
            UpdateExpression: "SET team_elo_applied = :t",
            ConditionExpression: "attribute_not_exists(team_elo_applied)",
            ExpressionAttributeValues: { ":t": true },
        },
    },
    ...rated.map((p) => ({
        Put: {
            TableName: TABLE,
            Item: {
                PK: userPK(p.user_id),
                SK: userRaceSK(now, roomId),
                room_id: roomId,
                finished_at: now,
                display_name: p.display_name,
                language,
                scaled_wpm: p.scaled_wpm ?? 0,
                net_wpm: p.net_wpm ?? 0,
                gross_wpm: p.gross_wpm ?? 0,
                accuracy: p.accuracy ?? 0,
                mode: "team",
                team_id: teamOf.get(p.user_id),
                won: teamOf.get(p.user_id) === winnerId,
            },
        },
    })),
];

export const commandBus = new CommandBus()
    .use(telemetryMiddleware)
    .register(
        ConnectToRoomCommand,
        new ConnectToRoomHandler(rooms, connections),
    )
    .register(
        DisconnectFromRoomCommand,
        new DisconnectFromRoomHandler(rooms, connections),
    )
    .register(
        StartCountdownCommand,
        new StartCountdownHandler(rooms, connections, clock),
    )
    .register(HeartbeatCommand, new HeartbeatHandler(connections))
    .register(
        SendChatCommand,
        new SendChatHandler(rooms, connections, broadcaster, clock),
    )
    .register(
        FinishRaceCommand,
        new FinishRaceHandler(
            rooms,
            connections,
            snippets,
            users,
            teamRooms,
            teamRatings,
            feed,
            broadcaster,
            clock,
            finishMetrics,
            buildTeamHistoryItems,
        ),
    );

export {
    ConnectToRoomCommand,
    DisconnectFromRoomCommand,
    FinishRaceCommand,
    HeartbeatCommand,
    SendChatCommand,
    StartCountdownCommand,
};
