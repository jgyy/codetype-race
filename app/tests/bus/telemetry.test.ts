import { describe, expect, test } from "bun:test";
import {
    Command,
    CommandBus,
    type CommandHandler,
    createTelemetryMiddleware,
} from "../../src";
import type {
    Counter,
    Histogram,
    Labels,
    Metrics,
    Span,
    Tracer,
} from "@codetype/domain";

class EchoCommand extends Command<string> {
    constructor(public readonly value: string) {
        super();
    }
}

class OkHandler implements CommandHandler<EchoCommand> {
    async execute(c: EchoCommand) {
        return c.value;
    }
}

class FailHandler implements CommandHandler<EchoCommand> {
    async execute(): Promise<string> {
        throw Object.assign(new Error("boom"), { code: "EXPLODED" });
    }
}

interface RecordedSpan {
    name: string;
    attrs: Record<string, unknown>;
    status: { code: "ok" | "error"; message?: string } | undefined;
    exceptions: unknown[];
    ended: boolean;
}

function buildRecordingTracer(): {
    tracer: Tracer;
    spans: RecordedSpan[];
} {
    const spans: RecordedSpan[] = [];
    const tracer: Tracer = {
        async startActiveSpan(name, fn) {
            const rec: RecordedSpan = {
                name,
                attrs: {},
                status: undefined,
                exceptions: [],
                ended: false,
            };
            spans.push(rec);
            const span: Span = {
                setAttribute: (k, v) => {
                    rec.attrs[k] = v;
                },
                setStatus: (s) => {
                    rec.status = s;
                },
                recordException: (e) => {
                    rec.exceptions.push(e);
                },
                end: () => {
                    rec.ended = true;
                },
            };
            try {
                return await fn(span);
            } finally {
                span.end();
            }
        },
    };
    return { tracer, spans };
}

interface RecordedMetric {
    op: "counter.add" | "histogram.record";
    name: string;
    value: number;
    labels?: Labels;
}

function buildRecordingMetrics(): {
    metrics: Metrics;
    events: RecordedMetric[];
} {
    const events: RecordedMetric[] = [];
    const counter = (name: string): Counter => ({
        add: (value, labels) =>
            events.push({ op: "counter.add", name, value, labels }),
    });
    const histogram = (name: string): Histogram => ({
        record: (value, labels) =>
            events.push({ op: "histogram.record", name, value, labels }),
    });
    return {
        metrics: { counter, histogram },
        events,
    };
}

describe("createTelemetryMiddleware (Phase 15 / slice-2)", () => {
    test("records span + RED metrics on success", async () => {
        const { tracer, spans } = buildRecordingTracer();
        const { metrics, events } = buildRecordingMetrics();
        const bus = new CommandBus()
            .use(createTelemetryMiddleware({ tracer, metrics, kind: "command" }))
            .register(EchoCommand, new OkHandler());

        const out = await bus.dispatch(new EchoCommand("hi"));
        expect(out).toBe("hi");

        expect(spans).toHaveLength(1);
        expect(spans[0]!.name).toBe("bus.command:EchoCommand");
        expect(spans[0]!.attrs).toEqual({
            "bus.kind": "command",
            "bus.name": "EchoCommand",
        });
        expect(spans[0]!.status).toEqual({ code: "ok" });
        expect(spans[0]!.ended).toBe(true);

        const counterEvents = events.filter((e) => e.op === "counter.add");
        expect(counterEvents).toHaveLength(1);
        expect(counterEvents[0]).toMatchObject({
            name: "app.commands.total",
            value: 1,
            labels: { name: "EchoCommand", outcome: "ok" },
        });
        const histEvents = events.filter((e) => e.op === "histogram.record");
        expect(histEvents).toHaveLength(1);
        expect(histEvents[0]!.name).toBe("app.command.duration_ms");
    });

    test("records error outcome and rethrows", async () => {
        const { tracer, spans } = buildRecordingTracer();
        const { metrics, events } = buildRecordingMetrics();
        const bus = new CommandBus()
            .use(createTelemetryMiddleware({ tracer, metrics, kind: "command" }))
            .register(EchoCommand, new FailHandler());

        await expect(bus.dispatch(new EchoCommand("x"))).rejects.toThrow(/boom/);

        expect(spans[0]!.status).toEqual({
            code: "error",
            message: "EXPLODED",
        });
        expect(spans[0]!.exceptions).toHaveLength(1);
        expect(spans[0]!.ended).toBe(true);

        const counterEvents = events.filter((e) => e.op === "counter.add");
        expect(counterEvents[0]!.labels).toEqual({
            name: "EchoCommand",
            outcome: "error",
        });
    });

    test("uses 'query' kind for query buses", async () => {
        const { tracer, spans } = buildRecordingTracer();
        const { metrics, events } = buildRecordingMetrics();
        const bus = new CommandBus()
            .use(createTelemetryMiddleware({ tracer, metrics, kind: "query" }))
            .register(EchoCommand, new OkHandler());
        await bus.dispatch(new EchoCommand("hi"));
        expect(spans[0]!.name).toBe("bus.query:EchoCommand");
        expect(events[0]!.name).toBe("app.queries.total");
    });

    test("falls back to no-op tracer/metrics when none supplied", async () => {
        const bus = new CommandBus()
            .use(createTelemetryMiddleware())
            .register(EchoCommand, new OkHandler());
        await expect(bus.dispatch(new EchoCommand("x"))).resolves.toBe("x");
    });

    test("routes log lines through the injected logger", async () => {
        const infoCalls: Record<string, unknown>[] = [];
        const errorCalls: Record<string, unknown>[] = [];
        const logger = {
            info: (f: Record<string, unknown>) => infoCalls.push(f),
            error: (f: Record<string, unknown>) => errorCalls.push(f),
        };
        const okBus = new CommandBus()
            .use(createTelemetryMiddleware({ logger, kind: "command" }))
            .register(EchoCommand, new OkHandler());
        await okBus.dispatch(new EchoCommand("hi"));
        expect(infoCalls).toHaveLength(1);
        expect(infoCalls[0]).toMatchObject({
            msg: "bus.dispatch",
            bus: "EchoCommand",
            ok: true,
        });

        const failBus = new CommandBus()
            .use(createTelemetryMiddleware({ logger, kind: "command" }))
            .register(EchoCommand, new FailHandler());
        await expect(failBus.dispatch(new EchoCommand("x"))).rejects.toThrow();
        expect(errorCalls).toHaveLength(1);
        expect(errorCalls[0]).toMatchObject({
            msg: "bus.dispatch",
            bus: "EchoCommand",
            ok: false,
            code: "EXPLODED",
        });
    });
});
