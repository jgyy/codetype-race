import { describe, expect, it } from "bun:test";
import { sanitise } from "../src/sanitiser";

const REDACTED = "[REDACTED]";
const VALID_JWT =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.signature_here";

describe("sanitise (Phase 15 / slice-8)", () => {
    it("redacts case-insensitive Authorization / Cookie keys", () => {
        const out = sanitise({
            Authorization: "Bearer abc",
            cookie: "session=xyz",
            "Set-Cookie": "id=1",
            normal: "kept",
        });
        expect(out).toEqual({
            Authorization: REDACTED,
            cookie: REDACTED,
            "Set-Cookie": REDACTED,
            normal: "kept",
        });
    });

    it("redacts JWT-shaped strings even when the key is innocuous", () => {
        const out = sanitise({ idToken: VALID_JWT });
        expect((out as { idToken: string }).idToken).toBe(REDACTED);
    });

    it("redacts Bearer token strings", () => {
        const out = sanitise({ headerValue: "Bearer eyJhbGciOiJIUzI1NiJ9.xxx" });
        expect((out as { headerValue: string }).headerValue).toBe(REDACTED);
    });

    it("leaves random strings untouched", () => {
        const out = sanitise({ name: "alice", id: "u_123" });
        expect(out).toEqual({ name: "alice", id: "u_123" });
    });

    it("recurses into nested objects and arrays", () => {
        const out = sanitise({
            request: {
                headers: { Authorization: "Bearer abc" },
                body: { items: [{ password: "p" }, { ok: 1 }] },
            },
        });
        expect(out).toEqual({
            request: {
                headers: { Authorization: REDACTED },
                body: { items: [{ password: REDACTED }, { ok: 1 }] },
            },
        });
    });

    it("redacts DDB Item / Items payloads when nested", () => {
        const out = sanitise({
            span: { Item: { PK: "u#1", token: "abc" } },
        });
        expect(out).toEqual({ span: { Item: REDACTED } });
    });

    it("does NOT redact a top-level field literally named 'Item' (only when nested)", () => {
        // Top-level use is left alone — apps that legitimately use this name
        // at the root won't have their domain payloads silently nuked.
        const out = sanitise({ Item: { ok: 1 } });
        expect(out).toEqual({ Item: { ok: 1 } });
    });

    it("does not mutate the input", () => {
        const input = {
            Authorization: "Bearer abc",
            nested: { cookie: "c" },
        };
        const snapshot = JSON.parse(JSON.stringify(input));
        sanitise(input);
        expect(input).toEqual(snapshot);
    });

    it("supports user-supplied extra sensitive keys", () => {
        const out = sanitise(
            { sessionToken: "abc", normal: 1 },
            { extraKeys: ["sessiontoken"] },
        );
        expect(out).toEqual({ sessionToken: REDACTED, normal: 1 });
    });

    it("guards against deep recursion (cycle protection)", () => {
        const a: Record<string, unknown> = { name: "a" };
        a.self = a; // pathological cycle
        const out = sanitise(a, { maxDepth: 3 }) as Record<string, unknown>;
        // Deep enough recursion should bottom out at REDACTED rather than overflow.
        let cur: unknown = out;
        for (let i = 0; i < 10; i++) {
            if (cur === REDACTED) break;
            cur = (cur as Record<string, unknown>).self;
        }
        expect(cur).toBe(REDACTED);
    });

    it("passes primitives and null through unchanged", () => {
        expect(sanitise(42)).toBe(42);
        expect(sanitise(null)).toBeNull();
        expect(sanitise("hello")).toBe("hello");
        expect(sanitise(undefined)).toBeUndefined();
    });
});
