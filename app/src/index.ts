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
