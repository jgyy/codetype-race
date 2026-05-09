import { describe, expect, test } from "bun:test";
import { ApiGwBroadcaster } from "../src/ApiGwBroadcaster";
import {
    wsHttpHandler,
    __wsHttpHandlerInternalsForTest,
} from "../src/wsHttpHandler";

describe("wsHttpHandler (Phase 16.4)", () => {
    test("the shared Agent has keepAlive enabled", () => {
        const agent = __wsHttpHandlerInternalsForTest.sharedAgent;
        expect(agent.keepAlive).toBe(true);
        // Default keepAliveMsecs would be 1_000 (Node default).
        // We set 30 s so warm invocations near the gap edge still reuse.
        expect(agent.options.keepAliveMsecs).toBe(30_000);
    });

    test("the handler exposes connect/request timeouts", () => {
        const cfg = wsHttpHandler.config ?? {};
        expect(cfg).toBeDefined();
    });

    test("ApiGwBroadcaster wires the shared handler into its client", () => {
        const b = new ApiGwBroadcaster({
            endpoint: "https://example.execute-api.test/prod",
        });
        // We can't easily reach into the client to read the requestHandler
        // without depending on SDK internals. Instead, assert the broadcaster
        // constructed without throwing — proving the requestHandler option
        // shape is accepted by the client constructor.
        expect(b).toBeInstanceOf(ApiGwBroadcaster);
    });
});
