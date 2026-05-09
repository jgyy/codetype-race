import { describe, expect, test } from "bun:test";
import {
    DROP_DISCONNECT_THRESHOLD,
    MAX_LAG_FRAMES,
    shouldDropFrame,
    shouldForceDisconnect,
} from "../src/services/dropOnSlow";

describe("shouldDropFrame (Phase 16.7)", () => {
    test("never drops when client has not yet acked anything (cold start)", () => {
        expect(shouldDropFrame(50, undefined)).toBe(false);
        expect(shouldDropFrame(50, 0)).toBe(false);
        expect(shouldDropFrame(10_000, undefined)).toBe(false);
    });

    test("does not drop when client is caught up", () => {
        expect(shouldDropFrame(101, 100)).toBe(false);
        expect(shouldDropFrame(50, 50)).toBe(false);
    });

    test("drops at the boundary: gap > MAX_LAG_FRAMES", () => {
        expect(shouldDropFrame(100 + MAX_LAG_FRAMES, 100)).toBe(false);
        expect(shouldDropFrame(101 + MAX_LAG_FRAMES, 100)).toBe(true);
    });

    test("drops large lags", () => {
        expect(shouldDropFrame(1_000, 1)).toBe(true);
    });

    test("custom threshold honoured", () => {
        expect(shouldDropFrame(20, 10, 5)).toBe(true);
        expect(shouldDropFrame(15, 10, 5)).toBe(false);
        expect(shouldDropFrame(16, 10, 5)).toBe(true);
    });
});

describe("shouldForceDisconnect (Phase 16.7)", () => {
    test("0 drops never triggers", () => {
        expect(shouldForceDisconnect(0)).toBe(false);
    });

    test("under threshold does not trigger", () => {
        expect(shouldForceDisconnect(DROP_DISCONNECT_THRESHOLD - 1)).toBe(false);
    });

    test("at exact threshold triggers", () => {
        expect(shouldForceDisconnect(DROP_DISCONNECT_THRESHOLD)).toBe(true);
    });

    test("above threshold triggers", () => {
        expect(shouldForceDisconnect(DROP_DISCONNECT_THRESHOLD + 1)).toBe(true);
    });

    test("custom threshold honoured", () => {
        expect(shouldForceDisconnect(2, 3)).toBe(false);
        expect(shouldForceDisconnect(3, 3)).toBe(true);
    });
});
