/**
 * Phase 15 / slice-6 — pure helpers for the W3C traceparent field
 * carried on WS message envelopes by the server (lambdas/src/postTo).
 *
 * Kept dependency-free so home-route bundles don't pull the OTel SDK in.
 * The RUM module (web/src/lib/otel.ts) imports these and lazily decides
 * whether to start a child span; everything below is safe in tree-shaken
 * builds even when RUM is disabled.
 *
 * W3C trace-context spec: https://www.w3.org/TR/trace-context/
 *   version "00" : "-" trace-id "-" parent-id "-" trace-flags
 *   trace-id   = 32 hex
 *   parent-id  = 16 hex
 *   trace-flags = 2 hex
 */

export interface ParsedTraceparent {
    traceId: string;
    spanId: string;
    traceFlags: number;
}

const TRACE_ID_RX = /^[0-9a-f]{32}$/;
const SPAN_ID_RX = /^[0-9a-f]{16}$/;
const FLAGS_RX = /^[0-9a-f]{2}$/;
const ALL_ZERO_TRACE = "00000000000000000000000000000000";
const ALL_ZERO_SPAN = "0000000000000000";

export function parseTraceparent(
    raw: unknown,
): ParsedTraceparent | undefined {
    if (typeof raw !== "string") return undefined;
    const parts = raw.split("-");
    if (parts.length !== 4) return undefined;
    const [version, traceId, spanId, flags] = parts;
    if (version !== "00") return undefined;
    if (!TRACE_ID_RX.test(traceId!) || traceId === ALL_ZERO_TRACE) return undefined;
    if (!SPAN_ID_RX.test(spanId!) || spanId === ALL_ZERO_SPAN) return undefined;
    if (!FLAGS_RX.test(flags!)) return undefined;
    return {
        traceId: traceId!,
        spanId: spanId!,
        traceFlags: parseInt(flags!, 16),
    };
}

/** Extract the traceparent off a parsed WS frame, ignoring malformed values. */
export function traceparentFromFrame(
    msg: unknown,
): ParsedTraceparent | undefined {
    if (msg === null || typeof msg !== "object") return undefined;
    const tp = (msg as { traceparent?: unknown }).traceparent;
    return parseTraceparent(tp);
}
