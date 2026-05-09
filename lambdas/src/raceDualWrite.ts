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

export function __resetBusCache(bus: RaceCommandBus | null = null) {
    cachedBus = bus;
}

export interface MaybeDualWriteInput<L> {
    path: string;
    flagEnv?: string;
    legacy: () => Promise<L>;
    toEvents: (legacyResult: L) => CommandPayload<unknown> | null;
    userId: (legacyResult: L) => string;
    raceId: (legacyResult: L) => string;
    commandIdFor?: (legacyResult: L) => string;
}

function isFlagOn(envVarName: string): boolean {
    const v = process.env[envVarName];
    return v === "1" || v === "true" || v === "on";
}

function defaultCommandIdFor(path: string, raceId: string): string {
    return uuidv5(`${path}:${raceId}`, DUALWRITE_NAMESPACE);
}

export async function maybeDualWrite<L>(
    input: MaybeDualWriteInput<L>,
): Promise<L> {
    const flagEnv = input.flagEnv ?? "PHASE_14_DUALWRITE";
    if (!isFlagOn(flagEnv)) {
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
