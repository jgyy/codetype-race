import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
    __resetRumForTests,
    __setSdkLoaderForTests,
    continueServerSpan,
    initRum,
    rumEnabled,
    type RumHandle,
} from "../src/lib/otel";

const VALID_TP = {
    traceId: "0af7651916cd43dd8448eb211c80319c",
    spanId: "b7ad6b7169203331",
    traceFlags: 1,
};

describe("rumEnabled (Phase 15 / slice-6)", () => {
    const origRandom = Math.random;
    afterEach(() => {
        Math.random = origRandom;
        delete process.env.NEXT_PUBLIC_RUM_ENABLED;
    });

    it("is on when ?trace=on is present, regardless of env or sample", () => {
        process.env.NEXT_PUBLIC_RUM_ENABLED = "0";
        Math.random = () => 0.99; // fail the dice roll
        expect(rumEnabled(0.05, { location: { search: "?trace=on" } })).toBe(true);
    });

    it("is off when env flag is unset, even with the dice winning", () => {
        Math.random = () => 0;
        expect(rumEnabled(0.05, { location: { search: "" } })).toBe(false);
    });

    it("respects the sample ratio when env flag is on", () => {
        process.env.NEXT_PUBLIC_RUM_ENABLED = "1";
        Math.random = () => 0.04;
        expect(rumEnabled(0.05, { location: { search: "" } })).toBe(true);
        Math.random = () => 0.06;
        expect(rumEnabled(0.05, { location: { search: "" } })).toBe(false);
    });

    it("treats an absent window as off (SSR safety)", () => {
        expect(rumEnabled(1, undefined)).toBe(false);
    });
});

describe("initRum", () => {
    beforeEach(() => {
        __resetRumForTests();
        __setSdkLoaderForTests(undefined);
    });
    afterEach(() => {
        __resetRumForTests();
        __setSdkLoaderForTests(undefined);
    });

    it("returns a dry-run handle when no endpoint is configured", async () => {
        const handle = await initRum({});
        expect(handle.active).toBe(false);
    });

    it("falls back to dry-run when the SDK is missing", async () => {
        const handle = await initRum({ endpoint: "https://example/v1/traces" });
        expect(handle.active).toBe(false);
    });

    it("uses the SDK loader when one is wired", async () => {
        const fakeHandle: RumHandle = {
            active: true,
            startWsChildSpan: () => ({ end: () => {} }),
            shutdown: async () => {},
        };
        __setSdkLoaderForTests(async () => ({
            start: () => fakeHandle,
        }));
        const handle = await initRum({
            endpoint: "https://example/v1/traces",
            serviceName: "codetype-web",
            sampleRatio: 0.05,
        });
        expect(handle).toBe(fakeHandle);
        expect(handle.active).toBe(true);
    });

    it("is idempotent — second call returns the cached handle", async () => {
        let starts = 0;
        __setSdkLoaderForTests(async () => ({
            start: () => {
                starts++;
                return {
                    active: true,
                    startWsChildSpan: () => ({ end: () => {} }),
                    shutdown: async () => {},
                };
            },
        }));
        const a = await initRum({ endpoint: "x" });
        const b = await initRum({ endpoint: "x" });
        expect(a).toBe(b);
        expect(starts).toBe(1);
    });
});

describe("continueServerSpan", () => {
    it("starts and ends a child span when rum is active", () => {
        let started = 0;
        let ended = 0;
        const rum: RumHandle = {
            active: true,
            startWsChildSpan: (_e, _tp) => {
                started++;
                return { end: () => ended++ };
            },
            shutdown: async () => {},
        };
        continueServerSpan(rum, "RACE_STARTED", VALID_TP);
        expect(started).toBe(1);
        expect(ended).toBe(1);
    });

    it("is a no-op when rum is undefined", () => {
        expect(() =>
            continueServerSpan(undefined, "X", VALID_TP),
        ).not.toThrow();
    });

    it("is a no-op when rum is dry-run (active=false)", () => {
        let started = 0;
        const rum: RumHandle = {
            active: false,
            startWsChildSpan: () => {
                started++;
                return { end: () => {} };
            },
            shutdown: async () => {},
        };
        continueServerSpan(rum, "X", VALID_TP);
        expect(started).toBe(0);
    });

    it("is a no-op when traceparent is undefined", () => {
        let started = 0;
        const rum: RumHandle = {
            active: true,
            startWsChildSpan: () => {
                started++;
                return { end: () => {} };
            },
            shutdown: async () => {},
        };
        continueServerSpan(rum, "X", undefined);
        expect(started).toBe(0);
    });
});
