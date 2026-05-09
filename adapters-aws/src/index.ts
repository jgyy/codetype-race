export const ADAPTERS_AWS_PACKAGE = "@codetype/adapters-aws" as const;

export { SystemClock } from "./SystemClock";
export { CryptoRandom } from "./CryptoRandom";
export { DdbRoomRepo, type DdbRoomRepoConfig } from "./DdbRoomRepo";
export { DdbSnippetRepo, type DdbSnippetRepoConfig } from "./DdbSnippetRepo";
export {
    DdbConnectionRepo,
    type DdbConnectionRepoConfig,
} from "./DdbConnectionRepo";
export { ApiGwBroadcaster, type ApiGwBroadcasterConfig } from "./ApiGwBroadcaster";
export { wsHttpHandler } from "./wsHttpHandler";
export {
    DdbLeaderboardProjection,
    type DdbLeaderboardProjectionConfig,
} from "./DdbLeaderboardProjection";
export {
    DdbIdempotencyStore,
    type DdbIdempotencyStoreConfig,
} from "./DdbIdempotencyStore";
export {
    DdbOutboxStore,
    type DdbOutboxStoreConfig,
} from "./DdbOutboxStore";
export {
    DdbRaceEventStore,
    type DdbRaceEventStoreConfig,
} from "./DdbRaceEventStore";
export {
    DdbRaceProjectionStore,
    type DdbRaceProjectionStoreConfig,
} from "./DdbRaceProjectionStore";
