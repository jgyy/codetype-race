// Phase 15 / slice-5 — W3C trace-context propagation across the WS boundary.
//
// On every outgoing WS frame we inject a `traceparent` field built from the
// currently-active OTel span context. Once the frontend RUM lands (separate
// slice) the browser extracts this header, parents a child span on it, and
// the trace tree spans browser → APIGW → Lambda → DDB Stream → broadcast →
// browser, all under one trace id.
//
// W3C traceparent format: 00-<32-hex traceId>-<16-hex spanId>-<2-hex flags>
// https://www.w3.org/TR/trace-context/

interface SpanContext {
    traceId: string;
    spanId: string;
    traceFlags?: number;
}

interface OtelApiShape {
    trace: { getActiveSpan: () => unknown };
}

function loadOtelApi(): OtelApiShape | undefined {
    const g = globalThis as { __codetypeOtel?: { api?: OtelApiShape } };
    return g.__codetypeOtel?.api;
}

function activeSpanContext(): SpanContext | undefined {
    const api = loadOtelApi();
    if (!api) return undefined;
    try {
        const span = api.trace.getActiveSpan() as
            | { spanContext?: () => SpanContext }
            | undefined;
        if (!span?.spanContext) return undefined;
        const ctx = span.spanContext();
        if (!ctx?.traceId || !ctx?.spanId) return undefined;
        return ctx;
    } catch {
        return undefined;
    }
}

const TRACE_ID_RX = /^[0-9a-f]{32}$/;
const SPAN_ID_RX = /^[0-9a-f]{16}$/;

/** Build a W3C traceparent string, or undefined if no active span. */
export function currentTraceparent(): string | undefined {
    const ctx = activeSpanContext();
    if (!ctx) return undefined;
    if (!TRACE_ID_RX.test(ctx.traceId) || !SPAN_ID_RX.test(ctx.spanId)) {
        return undefined;
    }
    const flags = ((ctx.traceFlags ?? 0) & 0xff)
        .toString(16)
        .padStart(2, "0");
    return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

/**
 * Returns a shallow copy of `payload` with `traceparent` set when an active
 * span exists. Non-object payloads (strings, numbers, null) are returned
 * untouched — only structured frames get the header. If `payload` already
 * has a `traceparent` field, it's preserved (caller-provided context wins).
 */
export function withTraceparent<T>(payload: T): T {
    if (payload === null || typeof payload !== "object") return payload;
    const existing = (payload as { traceparent?: unknown }).traceparent;
    if (typeof existing === "string" && existing.length > 0) return payload;
    const tp = currentTraceparent();
    if (!tp) return payload;
    return { ...(payload as Record<string, unknown>), traceparent: tp } as T;
}
