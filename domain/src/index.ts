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
    SnippetMeta,
    RecordFinishInput,
    CheatFlag,
    ConnectionRepo,
    ConnectionRecord,
    Broadcaster,
    LeaderboardProjection,
    LeaderboardEntry,
    UnitOfWork,
} from "./ports";
export type {
    Tracer,
    Span,
    SpanStatusCode,
    Metrics,
    Counter,
    Histogram,
    Labels,
} from "./ports";
export { NoopTracer, NoopMetrics } from "./ports";
