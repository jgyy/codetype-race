import type { Middleware } from "../Middleware";

/**
 * Slice 13.3 telemetry middleware: structured timing log per dispatch.
 * Phase 15 will replace `console.log` with an OTel span; the contract
 * here is intentionally minimal so that swap is local.
 */
export const telemetryMiddleware: Middleware = async (msg, next) => {
    const started = Date.now();
    try {
        const result = await next(msg);
        const ms = Date.now() - started;
        console.log(
            JSON.stringify({ bus: msg.kind, ok: true, ms }),
        );
        return result;
    } catch (err) {
        const ms = Date.now() - started;
        const code = (err as { code?: string })?.code ?? "unknown";
        console.log(
            JSON.stringify({ bus: msg.kind, ok: false, ms, code }),
        );
        throw err;
    }
};
