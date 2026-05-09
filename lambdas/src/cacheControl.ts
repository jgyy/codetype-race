/**
 * Phase 16.15 — Cache-Control header presets per the spec table.
 *
 * Handlers opt in by passing one of these strings (or a function that
 * returns one based on the response) to withHttp's `cacheControl`
 * option. Mutating endpoints (POST/PUT/PATCH/DELETE) and authenticated
 * /me/* routes default to no-store automatically — a missing
 * cacheControl on those is the safe choice.
 *
 * The CDN / browser is the consumer here. Set Vary: Cookie sparingly
 * (only when the same URL truly produces different bodies for
 * authenticated users); the spec calls out dropping it where not
 * needed.
 */

export const CacheControl = {
    /** Per-snippet content: snippets are write-once after approval. */
    SNIPPET_BY_ID: "public, max-age=86400, immutable",
    /** Snippet listings: small s-maxage, longer SWR window for resilience. */
    SNIPPET_LIST: "public, s-maxage=60, stale-while-revalidate=300",
    /** Current-season leaderboard: tiny shared-cache TTL keeps it fresh. */
    LEADERBOARD_LIVE: "public, s-maxage=10",
    /** Archived-season leaderboard: frozen forever, cache aggressively. */
    LEADERBOARD_ARCHIVED: "public, max-age=86400, immutable",
    /** Tournament list: cheap-to-fetch index, very short TTL. */
    TOURNAMENT_LIST: "public, s-maxage=10",
    /** Live tournament detail: status changes second-to-second. */
    TOURNAMENT_RUNNING: "public, s-maxage=2",
    /** Finished tournament detail: results are frozen. */
    TOURNAMENT_FINISHED: "public, max-age=86400, immutable",
    /** Authenticated user state: never cache shared. */
    PRIVATE_NO_STORE: "private, no-store",
} as const;

export type CacheControlValue = (typeof CacheControl)[keyof typeof CacheControl];
