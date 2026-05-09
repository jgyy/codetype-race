import type { Clock } from "../ports/Clock";
import type {
    CommandPayload,
    DispatchOutput,
    RaceCommandBus,
} from "./RaceCommandBus";

export interface DualWriteInput<L, E> {
    /** The legacy snapshot write — runs first, must succeed for the event side to fire. */
    legacy: () => Promise<L>;
    /**
     * Build an event-side CommandPayload from the legacy result. Return null
     * for legacy operations with no event-side equivalent (e.g., a pure-read
     * path that's still routed through dualWrite for symmetry).
     */
    eventBuild: (legacyResult: L) => CommandPayload<E> | null;
    bus: RaceCommandBus;
    raceId: (legacyResult: L) => string;
    userId: (legacyResult: L) => string;
    /** Idempotency key for the event-side dispatch. Typically derived from the
     * legacy result so re-runs (e.g., client retries) are idempotent. */
    commandId: (legacyResult: L) => string;
    newOutboxId: () => string;
    clock: Clock;
    /**
     * Soft-failure callback invoked when the event-side append fails. Default
     * mode: legacy result still returned, event failure logged here. The
     * onEventError callback is the integration's hook into structured logs /
     * metrics so a CloudWatch filter can fire a divergence alarm.
     */
    onEventError?: (err: Error, ctx: { legacyResult: L }) => void;
    /**
     * When true, a failure in the event-side append re-throws — useful for
     * late Phase A / Phase B once shadow-period divergence is at zero.
     * Default false to preserve "no behavior change" during early rollout.
     */
    strict?: boolean;
}

export interface DualWriteOutput<L, E> {
    legacyResult: L;
    eventOutcome: DispatchOutput<E> | null;
    eventError: Error | null;
}

/**
 * Phase A dual-write: legacy snapshot write runs first; on success, the same
 * domain action is recorded as RaceEvents through RaceCommandBus. Soft mode
 * (default) preserves the legacy contract — event-side failures don't fail
 * the legacy operation, they're surfaced through onEventError.
 *
 * The legacy operation runs OUTSIDE any try/catch — its errors propagate
 * unchanged. Only the event-side dispatch is guarded.
 */
export async function dualWrite<L, E>(
    input: DualWriteInput<L, E>,
): Promise<DualWriteOutput<L, E>> {
    const legacyResult = await input.legacy();

    const payloadBuilder = input.eventBuild(legacyResult);
    if (!payloadBuilder) {
        return { legacyResult, eventOutcome: null, eventError: null };
    }

    try {
        const eventOutcome = await input.bus.dispatch({
            userId: input.userId(legacyResult),
            commandId: input.commandId(legacyResult),
            raceId: input.raceId(legacyResult),
            newOutboxId: input.newOutboxId,
            clock: input.clock,
            handler: async () => payloadBuilder,
        });
        return { legacyResult, eventOutcome, eventError: null };
    } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        if (input.strict) throw e;
        input.onEventError?.(e, { legacyResult });
        return { legacyResult, eventOutcome: null, eventError: e };
    }
}
