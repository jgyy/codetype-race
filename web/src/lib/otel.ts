/**
 * Phase 15 / slice-6 — frontend RUM scaffold.
 *
 * The OTel browser SDK adds ~50 kB gzip; we don't want it on the home page
 * bundle. This module exposes a lazy-init API:
 *
 *   import { initRum } from "@/lib/otel";
 *   if (rumEnabled()) await initRum();
 *
 * `initRum()` dynamically imports the heavy SDK chunks, so they're only
 * fetched once the call site runs. Routes that never call `initRum()` (the
 * home page, marketing pages) ship zero OTel bytes.
 *
 * Sampling per spec § "Sampling":
 *   - 5% head-based per session.
 *   - 100% if `?trace=on` is present (debug aid).
 *   - Critical actions (host:create, room:join, race:start) are always
 *     sampled — but that decision lives at the action call site, not here.
 *
 * Until the deployed OTLP/HTTP endpoint exists (separate slice), the
 * exporter URL falls back to a no-op sink so dev builds don't 404. The
 * `endpoint` is read from `NEXT_PUBLIC_OTEL_OTLP_URL` at runtime.
 */

import { parseTraceparent, type ParsedTraceparent } from "./wsTraceparent";

export interface RumConfig {
    /** Service name attribute on every span (e.g. "codetype-web"). */
    readonly serviceName?: string;
    /** OTLP/HTTP endpoint. When absent, RUM is initialised in dry-run mode. */
    readonly endpoint?: string;
    /** Head-sample ratio in [0..1]. Defaults to 0.05. */
    readonly sampleRatio?: number;
}

export interface RumHandle {
    /** Whether the SDK actually started exporting (vs. dry-run). */
    readonly active: boolean;
    /**
     * Start a child span linked to a server-emitted traceparent. Returns a
     * tiny shape compatible with both the dry-run and real-SDK paths so
     * call sites don't branch on `active`.
     */
    startWsChildSpan(
        eventType: string,
        traceparent: ParsedTraceparent,
    ): { end(): void };
    shutdown(): Promise<void>;
}

/**
 * Compute whether RUM should initialise on this page load.
 *
 * Reads (in order):
 *   1. `?trace=on` query — always-on for debugging.
 *   2. `NEXT_PUBLIC_RUM_ENABLED` env — enable in deployed envs.
 *   3. Sample ratio dice roll.
 */
export function rumEnabled(
    sampleRatio = 0.05,
    win: { location?: { search?: string } } | undefined =
        typeof window === "undefined" ? undefined : window,
): boolean {
    if (win?.location?.search?.includes("trace=on")) return true;
    const envFlag =
        typeof process !== "undefined" &&
        process.env?.NEXT_PUBLIC_RUM_ENABLED === "1";
    if (!envFlag) return false;
    return Math.random() < sampleRatio;
}

let cached: Promise<RumHandle> | undefined;

const dryRunHandle: RumHandle = {
    active: false,
    startWsChildSpan: () => ({ end: () => {} }),
    shutdown: async () => {},
};

/**
 * Idempotent RUM initialiser. Lazily imports the OTel browser SDK only
 * the first time it's invoked; subsequent calls return the same handle.
 *
 * The dynamic imports below resolve to chunks that webpack/turbopack will
 * code-split out of the app shell. If the SDK packages are absent (devs
 * who haven't installed the OTel deps), we silently fall back to a
 * dry-run handle — a missing dep should never break the app.
 */
export async function initRum(config: RumConfig = {}): Promise<RumHandle> {
    if (cached) return cached;
    cached = (async (): Promise<RumHandle> => {
        if (!config.endpoint) return dryRunHandle;
        try {
            const sdk = await loadSdk();
            return sdk.start({
                endpoint: config.endpoint,
                serviceName: config.serviceName ?? "codetype-web",
                sampleRatio: config.sampleRatio ?? 0.05,
            });
        } catch (err) {
            console.warn("[rum] init failed, falling back to dry-run", err);
            return dryRunHandle;
        }
    })();
    return cached;
}

/**
 * Reset the cached handle. Tests only — production callers should treat
 * `initRum()` as a singleton.
 */
export function __resetRumForTests(): void {
    cached = undefined;
}

/**
 * Indirection point so tests can stub out the SDK without faking the
 * dynamic import contract. Production builds replace this with the real
 * loader once the OTel browser SDK is installed (next slice — gated on
 * Phase 16's bundle-budget work).
 */
let loadSdk: () => Promise<{
    start: (opts: {
        endpoint: string;
        serviceName: string;
        sampleRatio: number;
    }) => RumHandle;
}> = async () => {
    // Default loader: no SDK installed yet. This branch makes the module
    // safe to import in any environment — it just yields a dry-run handle.
    throw new Error("OTel browser SDK not installed");
};

export function __setSdkLoaderForTests(
    fn: typeof loadSdk | undefined,
): void {
    loadSdk = fn ?? (async () => {
        throw new Error("OTel browser SDK not installed");
    });
}

/**
 * Convenience helper for WS message handlers. Call site looks like:
 *
 *   const tp = traceparentFromFrame(msg);
 *   if (tp && rum.active) rum.startWsChildSpan(msg.type, tp).end();
 *
 * The wrapper here just guards the shape so consumers don't repeat the
 * null-checks at every receive site.
 */
export function continueServerSpan(
    rum: RumHandle | undefined,
    eventType: string,
    parsedTp: ParsedTraceparent | undefined,
): void {
    if (!rum?.active || !parsedTp) return;
    const span = rum.startWsChildSpan(eventType, parsedTp);
    span.end();
}

export { parseTraceparent };
