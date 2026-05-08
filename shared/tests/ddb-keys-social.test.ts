import { describe, expect, test } from "bun:test";
import {
    friendEdgeSK,
    friendRequestInboxSK,
    handleBucket,
    presenceConnLookupGSI1PK,
    presencePK,
    userHandleGSI1PK,
    userHandleGSI1SK,
} from "../src/ddb-keys";

describe("social ddb-keys", () => {
    test("friend edge SKs are deterministic", () => {
        expect(friendEdgeSK("bob")).toBe("FRIEND#bob");
        expect(friendRequestInboxSK("bob", "2026-05-08T12:00:00.000Z")).toBe(
            "FREQ#bob#2026-05-08T12:00:00.000Z",
        );
    });

    test("presence keys", () => {
        expect(presencePK("u1")).toBe("PRESENCE#u1");
        expect(presenceConnLookupGSI1PK("c1")).toBe("PRESENCE-CONN#c1");
    });

    test("handle bucket pads short prefixes and strips non-alphanumerics", () => {
        expect(handleBucket("ab")).toBe("ab_");
        expect(handleBucket("a b cd")).toBe("abc");
        expect(handleBucket("abcdef")).toBe("abc");
        expect(handleBucket("a-b-c")).toBe("abc");
    });

    test("handle GSI keys are case-insensitive (lower)", () => {
        const lower = "alice";
        expect(userHandleGSI1PK(lower)).toBe("USER#HANDLE#ali");
        expect(userHandleGSI1SK(lower, "u1")).toBe("alice#u1");
    });
});
