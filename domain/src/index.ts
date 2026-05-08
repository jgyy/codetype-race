export const DOMAIN_PACKAGE = "@codetype/domain" as const;

export { DomainError } from "./errors";
export { Room } from "./entities/Room";
export type {
    RoomMode,
    RoomSnapshot,
    RoomStatus,
    SeedPlayer,
    CreateRoomArgs,
} from "./entities/Room";
export { RoomId, JoinCode } from "./valueObjects";
export type {
    Clock,
    Random,
    RoomRepo,
    SnippetRepo,
    SnippetFilters,
    SnippetRef,
    ConnectionRepo,
    ConnectionRecord,
    Broadcaster,
} from "./ports";
