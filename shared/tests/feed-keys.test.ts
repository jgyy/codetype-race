import { describe, expect, test } from "bun:test";
import { feedPK, feedSK } from "../src/ddb-keys";

describe("feed keys", () => {
    test("feedPK", () => {
        expect(feedPK("u1")).toBe("FEED#u1");
    });

    test("feedSK is reverse-chronological (newer < older lexicographically)", () => {
        const older = feedSK(1_000_000, "ev-1");
        const newer = feedSK(2_000_000, "ev-2");
        expect(newer < older).toBe(true);
    });

    test("feedSK is zero-padded to a fixed width", () => {
        const sk = feedSK(1, "ev-x");
        expect(sk.startsWith("EV#")).toBe(true);
        const numericPart = sk.split("#")[1]!;
        expect(numericPart).toHaveLength(16);
    });
});
