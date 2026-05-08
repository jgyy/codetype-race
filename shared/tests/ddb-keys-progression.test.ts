import { describe, expect, test } from "bun:test";
import {
    xpLedgerPK,
    xpLedgerSK,
    xpSummarySK,
} from "../src/ddb-keys";

describe("progression keys", () => {
    test("xpLedgerPK", () => {
        expect(xpLedgerPK("u1")).toBe("XP#u1");
    });

    test("xpSummarySK is stable", () => {
        expect(xpSummarySK()).toBe("XP#SUMMARY");
    });

    test("xpLedgerSK sorts newer events first", () => {
        const older = xpLedgerSK(1_700_000_000_000, "a");
        const newer = xpLedgerSK(1_800_000_000_000, "b");
        expect(newer < older).toBe(true);
    });

    test("xpLedgerSK is deterministic per (ts,eventId)", () => {
        expect(xpLedgerSK(1, "x")).toBe(xpLedgerSK(1, "x"));
    });
});
