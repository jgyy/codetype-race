import { describe, expect, test } from "bun:test";
import { isConsecutiveUtcDay, utcDayKey } from "../../src/services/streak";

describe("utcDayKey", () => {
    test("formats as YYYY-MM-DD", () => {
        expect(utcDayKey(Date.parse("2026-05-06T12:34:56Z"))).toBe("2026-05-06");
    });

    test("uses UTC, not local", () => {
        expect(utcDayKey(Date.parse("2026-05-06T23:59:00Z"))).toBe("2026-05-06");
    });

    test("year boundary", () => {
        expect(utcDayKey(Date.parse("2025-12-31T23:59:59Z"))).toBe("2025-12-31");
        expect(utcDayKey(Date.parse("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
    });
});

describe("isConsecutiveUtcDay", () => {
    test("same day is not consecutive", () => {
        expect(isConsecutiveUtcDay("2026-05-06", "2026-05-06")).toBe(false);
    });

    test("next day is consecutive", () => {
        expect(isConsecutiveUtcDay("2026-05-06", "2026-05-07")).toBe(true);
    });

    test("two-day gap is not consecutive", () => {
        expect(isConsecutiveUtcDay("2026-05-06", "2026-05-08")).toBe(false);
    });

    test("year boundary is consecutive", () => {
        expect(isConsecutiveUtcDay("2025-12-31", "2026-01-01")).toBe(true);
    });

    test("backwards is not consecutive", () => {
        expect(isConsecutiveUtcDay("2026-05-07", "2026-05-06")).toBe(false);
    });
});
