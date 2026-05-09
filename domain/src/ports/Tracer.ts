export type SpanStatusCode = "ok" | "error";

export interface Span {
    setAttribute(key: string, value: unknown): void;
    setStatus(status: { code: SpanStatusCode; message?: string }): void;
    recordException(err: unknown): void;
    end(): void;
}

export interface Tracer {
    startActiveSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T>;
}

class NoopSpanImpl implements Span {
    setAttribute(): void { }
    setStatus(): void { }
    recordException(): void { }
    end(): void { }
}

export class NoopTracer implements Tracer {
    private readonly span = new NoopSpanImpl();
    async startActiveSpan<T>(
        _name: string,
        fn: (span: Span) => Promise<T>,
    ): Promise<T> {
        return fn(this.span);
    }
}
