import {
    NoopMetrics,
    NoopTracer,
    type Counter,
    type Histogram,
    type Labels,
    type Metrics,
    type Span,
    type Tracer,
} from "@codetype/domain";

interface OtelApiShape {
    trace: {
        getTracer: (name: string) => unknown;
    };
    metrics?: {
        getMeter: (name: string) => unknown;
    };
    SpanStatusCode: { OK: number; ERROR: number };
}

function loadOtelApi(): OtelApiShape | undefined {
    const g = globalThis as { __codetypeOtel?: { api?: OtelApiShape } };
    return g.__codetypeOtel?.api;
}

class OtelSpan implements Span {
    constructor(
        private readonly inner: {
            setAttribute: (k: string, v: unknown) => void;
            setStatus: (s: { code: number; message?: string }) => void;
            recordException: (e: unknown) => void;
            end: () => void;
        },
        private readonly statusCodes: { OK: number; ERROR: number },
    ) { }
    setAttribute(key: string, value: unknown): void {
        this.inner.setAttribute(key, value as never);
    }
    setStatus(status: { code: "ok" | "error"; message?: string }): void {
        this.inner.setStatus({
            code:
                status.code === "ok"
                    ? this.statusCodes.OK
                    : this.statusCodes.ERROR,
            message: status.message,
        });
    }
    recordException(err: unknown): void {
        this.inner.recordException(err);
    }
    end(): void {
        this.inner.end();
    }
}

class OtelTracer implements Tracer {
    constructor(
        private readonly inner: {
            startActiveSpan: <T>(
                name: string,
                fn: (span: unknown) => Promise<T> | T,
            ) => Promise<T> | T;
        },
        private readonly statusCodes: { OK: number; ERROR: number },
    ) { }

    async startActiveSpan<T>(
        name: string,
        fn: (span: Span) => Promise<T>,
    ): Promise<T> {
        return Promise.resolve(
            this.inner.startActiveSpan(name, async (raw) => {
                const span = new OtelSpan(
                    raw as ConstructorParameters<typeof OtelSpan>[0],
                    this.statusCodes,
                );
                try {
                    return await fn(span);
                } finally {
                    span.end();
                }
            }),
        );
    }
    startActiveSpanSync<T>(name: string, fn: (span: Span) => T): T {
        return this.inner.startActiveSpan(name, (raw) => {
            const span = new OtelSpan(
                raw as ConstructorParameters<typeof OtelSpan>[0],
                this.statusCodes,
            );
            try {
                return fn(span);
            } finally {
                span.end();
            }
        }) as T;
    }
}

class OtelCounter implements Counter {
    constructor(
        private readonly inner: { add: (n: number, l?: Labels) => void },
    ) { }
    add(value: number, labels?: Labels): void {
        this.inner.add(value, labels);
    }
}

class OtelHistogram implements Histogram {
    constructor(
        private readonly inner: { record: (n: number, l?: Labels) => void },
    ) { }
    record(value: number, labels?: Labels): void {
        this.inner.record(value, labels);
    }
}

class OtelMetrics implements Metrics {
    constructor(
        private readonly meter: {
            createCounter: (name: string) => OtelCounter["inner"];
            createHistogram: (name: string) => OtelHistogram["inner"];
        },
    ) { }
    counter(name: string): Counter {
        return new OtelCounter(this.meter.createCounter(name));
    }
    histogram(name: string): Histogram {
        return new OtelHistogram(this.meter.createHistogram(name));
    }
}

function buildTracer(api: OtelApiShape): Tracer {
    try {
        const inner = api.trace.getTracer("codetype") as ConstructorParameters<
            typeof OtelTracer
        >[0];
        return new OtelTracer(inner, api.SpanStatusCode);
    } catch {
        return new NoopTracer();
    }
}

function buildMetrics(api: OtelApiShape): Metrics {
    try {
        if (!api.metrics) return new NoopMetrics();
        const meter = api.metrics.getMeter(
            "codetype",
        ) as ConstructorParameters<typeof OtelMetrics>[0];
        return new OtelMetrics(meter);
    } catch {
        return new NoopMetrics();
    }
}

const api = loadOtelApi();
export const tracer: Tracer = api ? buildTracer(api) : new NoopTracer();
export const metrics: Metrics = api ? buildMetrics(api) : new NoopMetrics();
