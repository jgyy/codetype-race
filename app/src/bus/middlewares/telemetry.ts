import {
    NoopMetrics,
    NoopTracer,
    type Metrics,
    type Tracer,
} from "@codetype/domain";
import type { Middleware } from "../Middleware";

/**
 * Minimal logger shape consumed by the bus telemetry middleware. Kept
 * inline rather than promoting to a domain port because (a) only this
 * middleware uses it and (b) `lambdas/src/logger.ts` is the sole producer.
 * The default falls back to `console.log` of a JSON line so existing
 * behaviour is preserved when no logger is wired.
 */
export interface BusLogger {
    info(fields: { msg: string } & Record<string, unknown>): void;
    error(fields: { msg: string } & Record<string, unknown>): void;
}

export interface TelemetryDeps {
    tracer?: Tracer;
    metrics?: Metrics;
    logger?: BusLogger;
    kind?: "command" | "query";
}

const consoleLogger: BusLogger = {
    info: (fields) => console.log(JSON.stringify(fields)),
    error: (fields) => console.log(JSON.stringify(fields)),
};

export function createTelemetryMiddleware(
    deps: TelemetryDeps = {},
): Middleware {
    const tracer = deps.tracer ?? new NoopTracer();
    const metrics = deps.metrics ?? new NoopMetrics();
    const logger = deps.logger ?? consoleLogger;
    const kind = deps.kind ?? "command";
    const plural = kind === "query" ? "queries" : "commands";
    const totalCounter = metrics.counter(`app.${plural}.total`);
    const durationHistogram = metrics.histogram(`app.${kind}.duration_ms`);

    return async (msg, next) => {
        return tracer.startActiveSpan(
            `bus.${kind}:${msg.kind}`,
            async (span) => {
                span.setAttribute("bus.kind", kind);
                span.setAttribute("bus.name", msg.kind);
                const started = Date.now();
                try {
                    const result = await next(msg);
                    const ms = Date.now() - started;
                    span.setStatus({ code: "ok" });
                    totalCounter.add(1, { name: msg.kind, outcome: "ok" });
                    durationHistogram.record(ms, { name: msg.kind });
                    logger.info({
                        msg: "bus.dispatch",
                        bus: msg.kind,
                        ok: true,
                        ms,
                    });
                    return result;
                } catch (err) {
                    const ms = Date.now() - started;
                    const code = (err as { code?: string })?.code ?? "unknown";
                    span.recordException(err);
                    span.setStatus({ code: "error", message: code });
                    totalCounter.add(1, { name: msg.kind, outcome: "error" });
                    durationHistogram.record(ms, { name: msg.kind });
                    logger.error({
                        msg: "bus.dispatch",
                        bus: msg.kind,
                        ok: false,
                        ms,
                        code,
                    });
                    throw err;
                }
            },
        );
    };
}

export const telemetryMiddleware: Middleware = createTelemetryMiddleware();
