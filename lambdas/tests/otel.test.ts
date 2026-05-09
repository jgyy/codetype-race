import { describe, expect, it, beforeEach } from "bun:test";

describe("lambdas/src/otel shim (Phase 15 / slice-1)", () => {
  beforeEach(() => {
    // Force a fresh module evaluation per test so resolveTracer() re-reads
    // globalThis.__codetypeOtel.
    delete (globalThis as { __codetypeOtel?: unknown }).__codetypeOtel;
    delete require.cache[require.resolve("../src/otel")];
  });

  it("returns a no-op tracer when the layer hasn't preloaded", async () => {
    const { tracer } = await import("../src/otel");
    const result = await tracer.startActiveSpan("test", async (span) => {
      span.setAttribute("k", "v");
      span.setStatus({ code: "ok" });
      span.recordException(new Error("ignored"));
      span.end();
      return 42;
    });
    expect(result).toBe(42);
  });

  it("does not throw when the global stash has a malformed api", async () => {
    (globalThis as { __codetypeOtel?: unknown }).__codetypeOtel = {
      api: { trace: null },
    };
    const { tracer } = await import("../src/otel");
    expect(() => tracer.startActiveSpan("x", (s) => s.end())).not.toThrow();
  });
});
