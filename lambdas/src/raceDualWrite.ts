import { v5 as uuidv5 } from "uuid";
import { v4 as uuidv4 } from "uuid";
import {
    DdbIdempotencyStore,
    DdbRaceEventStore,
    SystemClock,
} from "@codetype/adapters-aws";
import {
    dualWrite,
    type DualWriteInput,
} from "@codetype/domain/DualWriter";
import {
    RaceCommandBus,
    type CommandPayload,
} from "@codetype/domain/RaceCommandBus";

import { ddb, TABLE } from "./ddb";

const DUALWRITE_NAMESPACE = "5b6f0a9e-1c2d-4e8f-9a3b-7d4c6e8f0a1b";

let cachedBus: RaceCommandBus | null = null;
function getBus(): RaceCommandBus {
    if (!cachedBus) {
        cachedBus = new RaceCommandBus({
            eventStore: new DdbRaceEventStore({ table: TABLE, client: ddb }),
            idempotencyStore: new DdbIdempotencyStore({ table: TABLE, client: ddb }),
        });
    }
    return cachedBus;
}

/** Reset for tests. */
export function __resetBusCache(bus: RaceCommandBus | null = null) {
    cachedBus = bus;
}

export interface MaybeDualWriteInput<L> {
    /** Path identifier used to scope the deterministic commandId — e.g. 'createRoom'. */
    path: string;
    /** Env var name (defaults to PHASE_14_DUALWRITE) controlling rollout per-path. */
    flagEnv?: string;
    /** The legacy snapshot write — its return type is what the handler's caller sees. */
    legacy: () => Promise<L>;
    /** Build the event-side payload from the legacy result. Return null to skip. */
    toEvents: (legacyResult: L) => CommandPayload<unknown> | null;
    /** Where to read the host/user id off the legacy result. */
    userId: (legacyResult: L) => string;
    /** Where to read the raceId off the legacy result. */
    raceId: (legacyResult: L) => string;
    /** Optional: derive the idempotency commandId. Defaults to uuidv5(path:raceId). */
    commandIdFor?: (legacyResult: L) => string;
}

function isFlagOn(envVarName: string): boolean {
    const v = process.env[envVarName];
    return v === "1" || v === "true" || v === "on";
}

function defaultCommandIdFor(path: string, raceId: string): string {
    return uuidv5(`${path}:${raceId}`, DUALWRITE_NAMESPACE);
}

/**
 * Run the legacy operation; if the dual-write flag is on, also emit events
 * via RaceCommandBus. Always returns the legacy result so callers stay
 * snapshot-compatible during Phase A. Event-side failures are logged with
 * tag 'dualwrite.event_error' for a CloudWatch metric-filter alarm; they do
 * not propagate.
 */
export async function maybeDualWrite<L>(
    input: MaybeDualWriteInput<L>,
): Promise<L> {
    const flagEnv = input.flagEnv ?? "PHASE_14_DUALWRITE";
    if (!isFlagOn(flagEnv)) {
        // Fast path: dual-write disabled. Behaviour unchanged.
        return input.legacy();
    }

    const dwInput: DualWriteInput<L, unknown> = {
        legacy: input.legacy,
        eventBuild: input.toEvents,
        bus: getBus(),
        raceId: input.raceId,
        userId: input.userId,
        commandId: (l) =>
            input.commandIdFor?.(l) ?? defaultCommandIdFor(input.path, input.raceId(l)),
        newOutboxId: () => uuidv4(),
        clock: new SystemClock(),
        onEventError: (err) => {
            console.log(
                JSON.stringify({
                    tag: "dualwrite.event_error",
                    path: input.path,
                    error: err.message,
                }),
            );
        },
    };
    const out = await dualWrite(dwInput);
    return out.legacyResult;
}
