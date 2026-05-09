import type { DynamoDBStreamEvent } from "aws-lambda";
import {
    DdbRaceEventStore,
    DdbRaceProjectionStore,
} from "@codetype/adapters-aws";
import {
    applyEventBatch,
    ProjectionGapError,
} from "@codetype/domain/RaceProjectionHandler";
import { ProjectionConflictError } from "@codetype/domain/ports/RaceProjectionStore";
import {
    initialRaceState,
    type RaceState,
} from "@codetype/domain/RaceReducer";
import type {
    RaceEventStore,
    RaceProjectionStore,
} from "@codetype/domain/ports";
import type { RaceEvent } from "@codetype/domain/events/RaceEvent";

import { ddb, TABLE } from "../ddb";
import { withStream } from "../middleware";
import { groupByRace, recordsToRaceEvents } from "./raceEventParse";

const MAX_RETRIES = 3;
const BACKFILL_LIMIT = 1000;

export interface ProjectRaceDeps {
    eventStore: RaceEventStore;
    projectionStore: RaceProjectionStore;
}

export interface ProjectRaceOutcome {
    raceId: string;
    appliedSeqs: number[];
    skippedSeqs: number[];
    backfilled: number;
    finalLastSeq: number;
}

/**
 * Reconcile one race's projection against an event batch from DDB Streams.
 *
 *   1. Fetch the current projection (or initial state if none).
 *   2. applyEventBatch — skips already-applied, throws on gap.
 *   3. On gap: backfill via listEvents from current lastSeq, prepend missing
 *      events, retry. Bounded by MAX_RETRIES so a malformed log can't loop.
 *   4. On projection conflict (concurrent writer): refetch and retry.
 */
export async function projectRace(
    raceId: string,
    streamEvents: readonly RaceEvent[],
    deps: ProjectRaceDeps,
): Promise<ProjectRaceOutcome> {
    let backfilled = 0;
    let pending: RaceEvent[] = [...streamEvents].sort((a, b) => a.seq - b.seq);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const stored = await deps.projectionStore.get(raceId);
        const prev: RaceState = stored ?? initialRaceState();
        const expectedLastSeq = stored ? prev.lastSeq : null;

        try {
            const result = applyEventBatch(prev, pending);
            if (result.appliedSeqs.length === 0) {
                return {
                    raceId,
                    appliedSeqs: [],
                    skippedSeqs: result.skippedSeqs,
                    backfilled,
                    finalLastSeq: prev.lastSeq,
                };
            }
            try {
                await deps.projectionStore.put({
                    raceId,
                    state: result.state,
                    expectedLastSeq,
                });
                return {
                    raceId,
                    appliedSeqs: result.appliedSeqs,
                    skippedSeqs: result.skippedSeqs,
                    backfilled,
                    finalLastSeq: result.state.lastSeq,
                };
            } catch (e) {
                if (e instanceof ProjectionConflictError) continue;
                throw e;
            }
        } catch (e) {
            if (!(e instanceof ProjectionGapError)) throw e;
            const missing = await deps.eventStore.listEvents({
                raceId,
                sinceSeq: prev.lastSeq,
                limit: BACKFILL_LIMIT,
            });
            if (missing.length === 0) {
                throw new Error(
                    `projection gap for ${raceId} but listEvents returned 0 from seq ${prev.lastSeq}`,
                );
            }
            backfilled += missing.length;
            const haveSeqs = new Set(pending.map((p) => p.seq));
            const merged = [
                ...missing.filter((m) => !haveSeqs.has(m.seq)),
                ...pending,
            ];
            pending = merged.sort((a, b) => a.seq - b.seq);
        }
    }

    throw new Error(
        `projectRace exhausted retries for ${raceId} after ${MAX_RETRIES} attempts`,
    );
}

const eventStore = new DdbRaceEventStore({ table: TABLE, client: ddb });
const projectionStore = new DdbRaceProjectionStore({
    table: TABLE,
    client: ddb,
});

export const handler = withStream(async (event: DynamoDBStreamEvent) => {
    const events = recordsToRaceEvents(event.Records ?? []);
    if (events.length === 0) return;
    const grouped = groupByRace(events);
    for (const [raceId, batch] of grouped) {
        await projectRace(raceId, batch, { eventStore, projectionStore });
    }
});
