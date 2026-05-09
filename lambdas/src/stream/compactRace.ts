import type { DynamoDBStreamEvent } from "aws-lambda";
import { v5 as uuidv5 } from "uuid";
import {
    DdbIdempotencyStore,
    DdbRaceEventStore,
    SystemClock,
} from "@codetype/adapters-aws";
import {
    buildCursorDigest,
    hasCursorDigest,
} from "@codetype/domain/CursorDigest";
import { RaceCommandBus } from "@codetype/domain/RaceCommandBus";
import type { RaceEventStore } from "@codetype/domain/ports";

import { ddb, TABLE } from "../ddb";
import { withStream } from "../middleware";
import { recordsToRaceEvents } from "./raceEventParse";

const COMPACT_NAMESPACE = "9f7d2c54-3a18-4ee5-8a2b-1c4d7e6f8a09";
const COMPACT_USER_ID = "system:compact";
const BACKFILL_LIMIT = 10_000;

function deterministicCommandId(raceId: string): string {
    return uuidv5(`compact:${raceId}`, COMPACT_NAMESPACE);
}

export interface CompactRaceDeps {
    eventStore: RaceEventStore;
    bus: RaceCommandBus;
    clock: { epochMs(): number };
    newOutboxId: () => string;
}

export async function compactRace(
    raceId: string,
    deps: CompactRaceDeps,
): Promise<{ compacted: boolean; samples: number; reason?: string }> {
    const events = await deps.eventStore.listEvents({
        raceId,
        sinceSeq: -1,
        limit: BACKFILL_LIMIT,
    });
    if (hasCursorDigest(events)) {
        return { compacted: false, samples: 0, reason: "already_compacted" };
    }
    const digest = buildCursorDigest(events);
    if (!digest) {
        return { compacted: false, samples: 0, reason: "no_started_at" };
    }
    const sampleCount = Object.values(digest.perPlayer).reduce(
        (acc, list) => acc + list.length,
        0,
    );
    if (sampleCount === 0) {
        return { compacted: false, samples: 0, reason: "no_cursor_events" };
    }
    await deps.bus.dispatch({
        userId: COMPACT_USER_ID,
        commandId: deterministicCommandId(raceId),
        raceId,
        newOutboxId: deps.newOutboxId,
        clock: deps.clock as any,
        handler: async () => ({
            events: [
                {
                    type: "CURSOR_DIGEST",
                    actorId: null,
                    payload: digest as unknown as Record<string, unknown>,
                },
            ],
            outboxChannelsFor: () => [],
            result: { compacted: true, samples: sampleCount },
        }),
    });
    return { compacted: true, samples: sampleCount };
}

const eventStore = new DdbRaceEventStore({ table: TABLE, client: ddb });
const idempotencyStore = new DdbIdempotencyStore({ table: TABLE, client: ddb });
const bus = new RaceCommandBus({ eventStore, idempotencyStore });
const clock = new SystemClock();

export const handler = withStream(async (event: DynamoDBStreamEvent) => {
    const events = recordsToRaceEvents(event.Records ?? []);
    const finished = events.filter((e) => e.type === "RACE_FINISHED");
    if (finished.length === 0) return;
    for (const ev of finished) {
        await compactRace(ev.raceId, {
            eventStore,
            bus,
            clock,
            newOutboxId: () => `cd-${ev.raceId}-${ev.seq}`,
        });
    }
});
