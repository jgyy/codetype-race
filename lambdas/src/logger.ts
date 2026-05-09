export type Level = "info" | "warn" | "error";

export interface LogFields {
    msg: string;
    [key: string]: unknown;
}

export interface Logger {
    info(fields: LogFields): void;
    warn(fields: LogFields): void;
    error(fields: LogFields): void;
    child(bound: Record<string, unknown>): Logger;
}

interface OtelApiShape {
    trace: {
        getActiveSpan: () => unknown;
    };
}

interface SpanContext {
    traceId: string;
    spanId: string;
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

function emit(
    level: Level,
    service: string,
    bound: Record<string, unknown>,
    fields: LogFields,
): void {
    const ctx = activeSpanContext();
    const line: Record<string, unknown> = {
        ts: new Date().toISOString(),
        level,
        service,
        ...bound,
        ...fields,
    };
    if (ctx) {
        line.trace_id = ctx.traceId;
        line.span_id = ctx.spanId;
    }
    const sink = level === "error" ? console.error : console.log;
    sink(JSON.stringify(line));
}

export function createLogger(
    service = process.env.OTEL_SERVICE_NAME ?? "codetype-unknown",
    bound: Record<string, unknown> = {},
): Logger {
    return {
        info: (f) => emit("info", service, bound, f),
        warn: (f) => emit("warn", service, bound, f),
        error: (f) => emit("error", service, bound, f),
        child: (extra) => createLogger(service, { ...bound, ...extra }),
    };
}

export const log: Logger = createLogger();
