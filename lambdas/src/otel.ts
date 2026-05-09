// Phase 15 / slice-1 shim.
//
// In slice-1 the OTel layer preloads via NODE_OPTIONS, so SDK init has
// already happened by the time this module loads. We only re-export a
// minimal `tracer` surface that slice-2 will use for manual spans.
//
// Importing this from a handler is currently optional (the layer's --require
// preload runs unconditionally). Once slice-2 introduces manual bus spans,
// every handler will `import './otel'` to get the typed tracer.
//
// The domain/ and app/ packages must NEVER import this file directly — they
// receive a Tracer port instead (added in slice-2). scripts/check-deps.ts
// enforces no @opentelemetry/* imports in those layers.

interface NoopSpan {
  setAttribute(_k: string, _v: unknown): void;
  setStatus(_s: { code: number; message?: string }): void;
  recordException(_e: unknown): void;
  end(): void;
}

interface Tracer {
  startActiveSpan<T>(name: string, fn: (span: NoopSpan) => T): T;
}

const noopSpan: NoopSpan = {
  setAttribute: () => {},
  setStatus: () => {},
  recordException: () => {},
  end: () => {},
};

const noopTracer: Tracer = {
  startActiveSpan: (_name, fn) => fn(noopSpan),
};

function resolveTracer(): Tracer {
  // The bootstrap stashes the loaded @opentelemetry/api on globalThis.
  // When sampler=always_off (slice-1) the real tracer is still a valid
  // object — calling startActiveSpan on it is a no-op for export but keeps
  // the call sites stable for slice-2.
  const g = globalThis as { __codetypeOtel?: { api?: unknown } };
  const api = g.__codetypeOtel?.api as
    | { trace: { getTracer: (name: string) => Tracer } }
    | undefined;
  if (!api) return noopTracer;
  try {
    return api.trace.getTracer("codetype");
  } catch {
    return noopTracer;
  }
}

export const tracer: Tracer = resolveTracer();
export type { Tracer, NoopSpan as Span };
