#!/usr/bin/env bun
/**
 * Phase-13/slice-5a — LeaderboardProjection rebuild procedure.
 *
 * Re-derives the global + per-language leaderboard rows from scratch
 * by scanning all USER#<id>/PROFILE items, then atomically replacing
 * the LEADERBOARD#GLOBAL and LEADERBOARD#LANG#<lang> partitions.
 *
 * When to run:
 *   - After a schema migration that changes leaderboard sort key shape.
 *   - To recover from drift if the inline transactional writes ever
 *     get out of sync with the canonical USER#<id>/PROFILE rating.
 *   - As part of a phase-14 cutover from inline-write to stream-driven
 *     write — rebuild once, then point the stream consumer at the
 *     leaderboard partitions.
 *
 * Status: STUB. Inline writes (UserRepo.applyRaceResults) currently
 * keep the projection up to date so a rebuild is not on the critical
 * path. Implement when phase-14 lands or when first drift is observed.
 */

console.error(
    "[rebuild-leaderboard] not implemented — see docs/specs/13-hexagonal-cqrs.md for the rebuild procedure",
);
process.exit(2);
