import { describe, expect, it } from "bun:test";
import {
    parseTraceparent,
    traceparentFromFrame,
} from "../src/lib/wsTraceparent";

const VALID_TRACE = "0af7651916cd43dd8448eb211c80319c";
const VALID_SPAN = "b7ad6b7169203331";

describe("parseTraceparent (Phase 15 / slice-6)", () => {
    it("parses a valid sampled traceparent", () => {
        expect(parseTraceparent(`00-${VALID_TRACE}-${VALID_SPAN}-01`)).toEqual({
            traceId: VALID_TRACE,
            spanId: VALID_SPAN,
            traceFlags: 1,
        });
    });

    it("parses an unsampled traceparent (flags=00)", () => {
        const tp = parseTraceparent(`00-${VALID_TRACE}-${VALID_SPAN}-00`);
        expect(tp?.traceFlags).toBe(0);
    });

    it("rejects non-string inputs", () => {
        expect(parseTraceparent(undefined)).toBeUndefined();
        expect(parseTraceparent(42)).toBeUndefined();
        expect(parseTraceparent({})).toBeUndefined();
    });

    it("rejects unsupported version bytes", () => {
        expect(
            parseTraceparent(`ff-${VALID_TRACE}-${VALID_SPAN}-01`),
        ).toBeUndefined();
        expect(
            parseTraceparent(`01-${VALID_TRACE}-${VALID_SPAN}-01`),
        ).toBeUndefined();
    });

    it("rejects all-zero trace/span ids (W3C invalidates these)", () => {
        expect(
            parseTraceparent(
                `00-00000000000000000000000000000000-${VALID_SPAN}-01`,
            ),
        ).toBeUndefined();
        expect(
            parseTraceparent(`00-${VALID_TRACE}-0000000000000000-01`),
        ).toBeUndefined();
    });

    it("rejects malformed lengths", () => {
        expect(parseTraceparent(`00-tooshort-${VALID_SPAN}-01`)).toBeUndefined();
        expect(
            parseTraceparent(`00-${VALID_TRACE}-${VALID_SPAN}-1`),
        ).toBeUndefined();
        expect(parseTraceparent(`${VALID_TRACE}-${VALID_SPAN}`)).toBeUndefined();
    });

    it("rejects non-hex characters", () => {
        const badTrace = "Z" + VALID_TRACE.slice(1);
        expect(
            parseTraceparent(`00-${badTrace}-${VALID_SPAN}-01`),
        ).toBeUndefined();
    });
});

describe("traceparentFromFrame", () => {
    it("returns parsed value when a frame carries a valid traceparent", () => {
        const tp = traceparentFromFrame({
            type: "RACE_STARTED",
            traceparent: `00-${VALID_TRACE}-${VALID_SPAN}-01`,
        });
        expect(tp?.traceId).toBe(VALID_TRACE);
    });

    it("returns undefined for null / non-objects", () => {
        expect(traceparentFromFrame(null)).toBeUndefined();
        expect(traceparentFromFrame("hello")).toBeUndefined();
        expect(traceparentFromFrame(undefined)).toBeUndefined();
    });

    it("returns undefined when the field is missing", () => {
        expect(traceparentFromFrame({ type: "X" })).toBeUndefined();
    });

    it("returns undefined when the field is malformed (does not throw)", () => {
        expect(
            traceparentFromFrame({ type: "X", traceparent: "garbage" }),
        ).toBeUndefined();
    });
});
