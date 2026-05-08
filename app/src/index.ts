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
