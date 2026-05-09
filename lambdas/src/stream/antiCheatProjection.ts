import type { DynamoDBStreamEvent } from "aws-lambda";
import { v5 as uuidv5 } from "uuid";
import {
    DdbIdempotencyStore,
    DdbRaceEventStore,
    SystemClock,
} from "@codetype/adapters-aws";
import {
    aggregateForPlayer,
    evaluatePlayer,
} from "@codetype/domain/AntiCheatProjection";
import { RaceCommandBus } from "@codetype/domain/RaceCommandBus";
import type {
    RaceEventStore,
    Tracer,
} from "@codetype/domain/ports";
import type { RaceEvent } from "@codetype/domain/events/RaceEvent";

import { ddb, TABLE } from "../ddb";
import { withStream } from "../middleware";
import { tracer as otelTracer } from "../otel";
import { recordsToRaceEvents } from "./raceEventParse";

const ANTICHEAT_NAMESPACE = "8d3f0c12-7e4a-4b6f-a91c-2f6b5a4e9d10";
const ANTICHEAT_USER_ID = "system:anticheat";
const BACKFILL_LIMIT = 10_000;

function deterministicCommandId(raceId: string, playerId: string): string {
    return uuidv5(`anticheat:${raceId}:${playerId}`, ANTICHEAT_NAMESPACE);
}

export interface AntiCheatDeps {
    eventStore: RaceEventStore;
    bus: RaceCommandBus;
    clock: { epochMs(): number };
    newOutboxId: () => string;
    tracer?: Tracer;
}

export async function evaluatePlayerAndFlag(
    raceId: string,
    playerId: string,
    deps: AntiCheatDeps,
): Promise<{ flagged: boolean; signals: string[] }> {
    const events = await deps.eventStore.listEvents({
        raceId,
        sinceSeq: -1,
        limit: BACKFILL_LIMIT,
    });
    const stats = aggregateForPlayer(events, playerId);
    const signals = evaluatePlayer(stats, { tracer: deps.tracer });
    if (signals.length === 0) {
        return { flagged: false, signals: [] };
    }
    const reason = signals.map((s) => s.code).join(",");
    const commandId = deterministicCommandId(raceId, playerId);
    await deps.bus.dispatch({
        userId: ANTICHEAT_USER_ID,
        commandId,
        raceId,
        newOutboxId: deps.newOutboxId,
        clock: deps.clock as any,
        handler: async () => ({
            events: [
                {
                    type: "PLAYER_FLAGGED",
                    actorId: playerId,
                    payload: {
                        userId: playerId,
                        reason,
                        signals: signals.map((s) => ({
                            code: s.code,
                            severity: s.severity,
                            detail: s.detail,
                        })),
                    },
                },
            ],
            outboxChannelsFor: () => [],
            result: { flagged: true, signals: signals.map((s) => s.code) },
        }),
    });
    return { flagged: true, signals: signals.map((s) => s.code) };
}

const eventStore = new DdbRaceEventStore({ table: TABLE, client: ddb });
const idempotencyStore = new DdbIdempotencyStore({ table: TABLE, client: ddb });
const bus = new RaceCommandBus({ eventStore, idempotencyStore });
const clock = new SystemClock();

export const handler = withStream(async (event: DynamoDBStreamEvent) => {
    const events = recordsToRaceEvents(event.Records ?? []);
    const finished = events.filter((e) => e.type === "PLAYER_FINISHED");
    if (finished.length === 0) return;
    for (const ev of finished) {
        const playerId = ev.actorId ?? String(ev.payload.userId ?? "");
        if (!playerId) continue;
        await evaluatePlayerAndFlag(ev.raceId, playerId, {
            eventStore,
            bus,
            clock,
            newOutboxId: () =>
                `ac-${ev.raceId}-${playerId}-${ev.seq}`,
            tracer: otelTracer,
        });
    }
});

export type { RaceEvent };
