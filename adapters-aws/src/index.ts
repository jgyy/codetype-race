// @codetype/adapters-aws — concrete I/O adapters implementing @codetype/domain ports.

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
export {
    DdbLeaderboardProjection,
    type DdbLeaderboardProjectionConfig,
} from "./DdbLeaderboardProjection";
