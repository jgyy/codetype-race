import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createLogger } from "../src/logger";

interface CapturedLine {
    sink: "stdout" | "stderr";
    parsed: Record<string, unknown>;
}

function captureLogs(): {
    lines: CapturedLine[];
    restore: () => void;
} {
    const lines: CapturedLine[] = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (s: unknown) =>
        lines.push({ sink: "stdout", parsed: JSON.parse(String(s)) });
    console.error = (s: unknown) =>
        lines.push({ sink: "stderr", parsed: JSON.parse(String(s)) });
    return {
        lines,
        restore: () => {
            console.log = origLog;
            console.error = origErr;
        },
    };
}

describe("logger (Phase 15 / slice-3)", () => {
    let cap: ReturnType<typeof captureLogs>;
    beforeEach(() => {
        cap = captureLogs();
        delete (globalThis as { __codetypeOtel?: unknown }).__codetypeOtel;
    });
    afterEach(() => cap.restore());

    it("emits a single JSON line with ts/level/service/msg", () => {
        const log = createLogger("codetype-test");
        log.info({ msg: "hello", route: "/x" });
        expect(cap.lines).toHaveLength(1);
        const line = cap.lines[0]!;
        expect(line.sink).toBe("stdout");
        expect(line.parsed.level).toBe("info");
        expect(line.parsed.service).toBe("codetype-test");
        expect(line.parsed.msg).toBe("hello");
        expect(line.parsed.route).toBe("/x");
        expect(typeof line.parsed.ts).toBe("string");
    });

    it("routes error to stderr", () => {
        const log = createLogger("codetype-test");
        log.error({ msg: "bad", code: "E" });
        expect(cap.lines[0]!.sink).toBe("stderr");
        expect(cap.lines[0]!.parsed.level).toBe("error");
    });

    it("omits trace_id/span_id when no active span is available", () => {
        const log = createLogger("codetype-test");
        log.info({ msg: "x" });
        expect(cap.lines[0]!.parsed.trace_id).toBeUndefined();
        expect(cap.lines[0]!.parsed.span_id).toBeUndefined();
    });

    it("injects trace_id/span_id from globalThis.__codetypeOtel when present", () => {
        (globalThis as { __codetypeOtel?: unknown }).__codetypeOtel = {
            api: {
                trace: {
                    getActiveSpan: () => ({
                        spanContext: () => ({
                            traceId: "0af7651916cd43dd8448eb211c80319c",
                            spanId: "b7ad6b7169203331",
                        }),
                    }),
                },
            },
        };
        const log = createLogger("codetype-test");
        log.info({ msg: "x" });
        expect(cap.lines[0]!.parsed.trace_id).toBe(
            "0af7651916cd43dd8448eb211c80319c",
        );
        expect(cap.lines[0]!.parsed.span_id).toBe("b7ad6b7169203331");
    });

    it("child() merges bound fields into every emit", () => {
        const log = createLogger("codetype-test").child({
            requestId: "req-1",
        });
        log.info({ msg: "first" });
        log.info({ msg: "second", route: "/y" });
        expect(cap.lines[0]!.parsed.requestId).toBe("req-1");
        expect(cap.lines[1]!.parsed.requestId).toBe("req-1");
        expect(cap.lines[1]!.parsed.route).toBe("/y");
    });

    it("sanitises sensitive fields before emit (Phase 15 / slice-8)", () => {
        const log = createLogger("codetype-test");
        log.info({
            msg: "incoming",
            Authorization: "Bearer abc",
            nested: { cookie: "session=x" },
        });
        const parsed = cap.lines[0]!.parsed;
        expect(parsed.Authorization).toBe("[REDACTED]");
        expect((parsed.nested as Record<string, unknown>).cookie).toBe(
            "[REDACTED]",
        );
        // Non-sensitive fields survive.
        expect(parsed.msg).toBe("incoming");
    });

    it("survives a malformed OTel api shape", () => {
        (globalThis as { __codetypeOtel?: unknown }).__codetypeOtel = {
            api: { trace: { getActiveSpan: () => null } },
        };
        const log = createLogger("codetype-test");
        expect(() => log.info({ msg: "ok" })).not.toThrow();
        expect(cap.lines[0]!.parsed.trace_id).toBeUndefined();
    });
});
