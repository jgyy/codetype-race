import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { currentTraceparent, withTraceparent } from "../src/traceContext";

const VALID_TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const VALID_SPAN_ID = "b7ad6b7169203331";

function setActiveSpan(ctx: {
    traceId: string;
    spanId: string;
    traceFlags?: number;
} | null): void {
    (globalThis as { __codetypeOtel?: unknown }).__codetypeOtel = {
        api: {
            trace: {
                getActiveSpan: () => (ctx ? { spanContext: () => ctx } : undefined),
            },
        },
    };
}

describe("traceContext (Phase 15 / slice-5)", () => {
    beforeEach(() => {
        delete (globalThis as { __codetypeOtel?: unknown }).__codetypeOtel;
    });
    afterEach(() => {
        delete (globalThis as { __codetypeOtel?: unknown }).__codetypeOtel;
    });

    describe("currentTraceparent", () => {
        it("returns undefined when no OTel api is loaded", () => {
            expect(currentTraceparent()).toBeUndefined();
        });

        it("returns undefined when there is no active span", () => {
            setActiveSpan(null);
            expect(currentTraceparent()).toBeUndefined();
        });

        it("formats W3C traceparent from a valid span context", () => {
            setActiveSpan({
                traceId: VALID_TRACE_ID,
                spanId: VALID_SPAN_ID,
                traceFlags: 1,
            });
            expect(currentTraceparent()).toBe(
                `00-${VALID_TRACE_ID}-${VALID_SPAN_ID}-01`,
            );
        });

        it("defaults trace flags to 00 when missing", () => {
            setActiveSpan({ traceId: VALID_TRACE_ID, spanId: VALID_SPAN_ID });
            expect(currentTraceparent()).toBe(
                `00-${VALID_TRACE_ID}-${VALID_SPAN_ID}-00`,
            );
        });

        it("rejects malformed trace/span ids rather than emitting bad headers", () => {
            setActiveSpan({ traceId: "tooshort", spanId: VALID_SPAN_ID });
            expect(currentTraceparent()).toBeUndefined();
            setActiveSpan({ traceId: VALID_TRACE_ID, spanId: "bad" });
            expect(currentTraceparent()).toBeUndefined();
        });
    });

    describe("withTraceparent", () => {
        it("returns non-object payloads untouched", () => {
            setActiveSpan({ traceId: VALID_TRACE_ID, spanId: VALID_SPAN_ID });
            expect(withTraceparent("hello")).toBe("hello");
            expect(withTraceparent(42)).toBe(42);
            expect(withTraceparent(null)).toBeNull();
        });

        it("adds traceparent to objects when an active span exists", () => {
            setActiveSpan({
                traceId: VALID_TRACE_ID,
                spanId: VALID_SPAN_ID,
                traceFlags: 1,
            });
            const out = withTraceparent({ type: "RACE_STARTED" });
            expect(out).toEqual({
                type: "RACE_STARTED",
                traceparent: `00-${VALID_TRACE_ID}-${VALID_SPAN_ID}-01`,
            });
        });

        it("preserves a caller-supplied traceparent", () => {
            setActiveSpan({ traceId: VALID_TRACE_ID, spanId: VALID_SPAN_ID });
            const callerTp = "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01";
            const out = withTraceparent({
                type: "X",
                traceparent: callerTp,
            });
            expect((out as { traceparent: string }).traceparent).toBe(callerTp);
        });

        it("leaves the original payload untouched (no mutation)", () => {
            setActiveSpan({ traceId: VALID_TRACE_ID, spanId: VALID_SPAN_ID });
            const original = { type: "X" };
            const out = withTraceparent(original);
            expect((original as Record<string, unknown>).traceparent).toBeUndefined();
            expect(out).not.toBe(original);
        });

        it("returns the payload unchanged when no active span", () => {
            const payload = { type: "X" };
            const out = withTraceparent(payload);
            expect(out).toBe(payload);
        });
    });
});
