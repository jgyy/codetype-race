// @codetype/adapters-aws — concrete I/O adapters implementing @codetype/domain ports.
//
// Slice 13.1 scaffold only. Real adapters (DdbRoomRepo, S3ReplayStore,
// APIGWBroadcaster, SystemClock, CryptoRandom, ...) land in 13.3+.

export const ADAPTERS_AWS_PACKAGE = "@codetype/adapters-aws" as const;
