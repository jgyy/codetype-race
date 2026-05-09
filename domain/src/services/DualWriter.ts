import type { Clock } from "../ports/Clock";
import type {
    CommandPayload,
    DispatchOutput,
    RaceCommandBus,
} from "./RaceCommandBus";

export interface DualWriteInput<L, E> {
    legacy: () => Promise<L>;
    eventBuild: (legacyResult: L) => CommandPayload<E> | null;
    bus: RaceCommandBus;
    raceId: (legacyResult: L) => string;
    userId: (legacyResult: L) => string;
    commandId: (legacyResult: L) => string;
    newOutboxId: () => string;
    clock: Clock;
    onEventError?: (err: Error, ctx: { legacyResult: L }) => void;
    strict?: boolean;
}

export interface DualWriteOutput<L, E> {
    legacyResult: L;
    eventOutcome: DispatchOutput<E> | null;
    eventError: Error | null;
}

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
