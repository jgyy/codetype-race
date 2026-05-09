import { Agent } from "node:https";
import { NodeHttpHandler } from "@smithy/node-http-handler";

/**
 * Phase 16.4 — explicit keep-alive HTTP handler for the
 * ApiGatewayManagementApi clients. SDK v3.521+ enables keep-alive by
 * default, so this is mostly a forward-compatibility safety net: by
 * supplying our own Agent we pin the behaviour we depend on (~20 ms
 * saved per `postToConnection` after the first one) instead of relying
 * on SDK defaults that may shift.
 *
 * The handler is intentionally a singleton constructed at module load
 * — a single Agent across every client in this execution environment
 * pools sockets across them. Lambda freezes the agent state between
 * invocations, so socket reuse spans warm invocations too.
 *
 * The 2-second timeouts pair with Phase 16.7 drop-on-slow: a stalled
 * client should be dropped quickly so it can't drag the broadcast
 * loop down.
 */
const sharedAgent = new Agent({
    keepAlive: true,
    keepAliveMsecs: 30_000,
    maxSockets: 256,
});

export const wsHttpHandler = new NodeHttpHandler({
    httpsAgent: sharedAgent,
    connectionTimeout: 2_000,
    requestTimeout: 2_000,
});

/**
 * Test hook — exposes the underlying Agent so unit tests can assert
 * keepAlive is configured without poking through SDK internals.
 */
export const __wsHttpHandlerInternalsForTest = { sharedAgent };
