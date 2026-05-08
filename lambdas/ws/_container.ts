import {
    CommandBus,
    ConnectToRoomCommand,
    ConnectToRoomHandler,
    DisconnectFromRoomCommand,
    DisconnectFromRoomHandler,
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
    SystemClock,
} from "@codetype/adapters-aws";
import { ddb, TABLE } from "../src/ddb";

const clock = new SystemClock();
const rooms = new DdbRoomRepo({ table: TABLE, client: ddb });
const connections = new DdbConnectionRepo({ table: TABLE, client: ddb });
const broadcaster = new ApiGwBroadcaster({
    endpoint: process.env.WS_ENDPOINT ?? "",
});

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
    );

export {
    ConnectToRoomCommand,
    DisconnectFromRoomCommand,
    HeartbeatCommand,
    SendChatCommand,
    StartCountdownCommand,
};
