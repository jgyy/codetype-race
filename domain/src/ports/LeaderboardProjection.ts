/**
 * Read-only projection port (CQRS-lite read side).
 *
 * The leaderboard is a denormalised top-N-per-language cache. It is
 * currently maintained inline by the rating-apply path (UserRepo
 * .applyRaceResults) — phase 14 (event sourcing) will move that
 * responsibility to a stream consumer. The read contract here is
 * stable across both regimes; only the write path changes.
 *
 * Projection ports are intentionally narrower than full repos:
 *   - never mutate (no save / put / delete methods)
 *   - safe to retry, safe to shed load via 503
 *   - results are fine to cache (CloudFront / Lambda layer)
 */
export interface LeaderboardEntry {
    user_id: string;
    display_name: string;
    rating: number;
}

export interface LeaderboardProjection {
    /**
     * Top-N rated entries, optionally filtered by language. When
     * `language` is undefined, returns the global leaderboard.
     */
    getTop(args: {
        language?: string;
        limit: number;
    }): Promise<LeaderboardEntry[]>;
}
