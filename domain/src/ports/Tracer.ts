/**
 * Vendor-neutral tracing port. Phase 15 / slice-2.
 *
 * Domain and app code use this interface only — they MUST NOT import
 * `@opentelemetry/*` (enforced by scripts/check-deps.ts). The runtime
 * container in `lambdas/` wires an OTel-backed implementation; tests use
 * `NoopTracer`.
 */

export type SpanStatusCode = "ok" | "error";

export interface Span {
    setAttribute(key: string, value: unknown): void;
    setStatus(status: { code: SpanStatusCode; message?: string }): void;
    recordException(err: unknown): void;
    end(): void;
}

export interface Tracer {
    /**
     * Start a span, run `fn` with it as the current span, then end it.
     * Implementations are responsible for ending the span on both happy and
     * error paths — handlers should NOT call `span.end()` themselves.
     */
    startActiveSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T>;
}

class NoopSpanImpl implements Span {
    setAttribute(): void {}
    setStatus(): void {}
    recordException(): void {}
    end(): void {}
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
