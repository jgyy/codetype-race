import {
    NoopMetrics,
    NoopTracer,
    type Metrics,
    type Tracer,
} from "@codetype/domain";
import type { Middleware } from "../Middleware";

export interface TelemetryDeps {
    tracer?: Tracer;
    metrics?: Metrics;
    kind?: "command" | "query";
}

export function createTelemetryMiddleware(
    deps: TelemetryDeps = {},
): Middleware {
    const tracer = deps.tracer ?? new NoopTracer();
    const metrics = deps.metrics ?? new NoopMetrics();
    const kind = deps.kind ?? "command";
    const totalCounter = metrics.counter(`app.${kind}s.total`);
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
                    console.log(
                        JSON.stringify({ bus: msg.kind, ok: true, ms }),
                    );
                    return result;
                } catch (err) {
                    const ms = Date.now() - started;
                    const code = (err as { code?: string })?.code ?? "unknown";
                    span.recordException(err);
                    span.setStatus({ code: "error", message: code });
                    totalCounter.add(1, { name: msg.kind, outcome: "error" });
                    durationHistogram.record(ms, { name: msg.kind });
                    console.log(
                        JSON.stringify({ bus: msg.kind, ok: false, ms, code }),
                    );
                    throw err;
                }
            },
        );
    };
}

export const telemetryMiddleware: Middleware = createTelemetryMiddleware();
