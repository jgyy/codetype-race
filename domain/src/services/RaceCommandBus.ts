import type { Clock } from "../ports/Clock";
import type {
    OutboxChannel,
    OutboxEntry,
} from "../events/OutboxEntry";
import type {
    RaceEvent,
    RaceEventType,
} from "../events/RaceEvent";
import type { IdempotencyStore } from "../ports/IdempotencyStore";
import type { RaceEventStore } from "../ports/RaceEventStore";
import { TransactionConflictError } from "../ports/RaceEventStore";

export interface RaceEventDraft {
    type: RaceEventType;
    occurredAt?: string;
    actorId: string | null;
    payload: Record<string, unknown>;
}

export interface CommandPayload<T> {
    events: RaceEventDraft[];
    /**
     * Per-event channel selector. If omitted, every event spawns one outbox row
     * on the `broadcast` channel — covers the room-WS notify case which is the
     * common path. Return `[]` to emit no outbox row for an event (e.g., a
     * cursor-progress event that's already covered by the projection update).
     */
    outboxChannelsFor?: (
        draft: RaceEventDraft,
        index: number,
    ) => readonly OutboxChannel[];
    result: T;
    httpStatus?: number;
}

export interface DispatchInput<T> {
    userId: string;
    commandId: string;
    raceId: string;
    /** Typically the request id; falls back to commandId. */
    correlationId?: string;
    /** Causal predecessor — for events triggered by other events. */
    causationId?: string | null;
    /** Cache lifetime for the idempotency row. Defaults to 1 hour. */
    idempotencyTtlSeconds?: number;
    /** Caller-provided id factory for outbox rows. */
    newOutboxId: () => string;
    clock: Clock;
    handler: () => Promise<CommandPayload<T>>;
}

export interface DispatchOutput<T> {
    result: T;
    httpStatus: number;
    replay: boolean;
    events: RaceEvent[];
}

export interface RaceCommandBusDeps {
    eventStore: RaceEventStore;
    idempotencyStore: IdempotencyStore;
}

const DEFAULT_TTL_SECONDS = 3600;

function defaultChannelsFor(): readonly OutboxChannel[] {
    return ["broadcast"];
}

export class RaceCommandBus {
    constructor(private readonly deps: RaceCommandBusDeps) { }

    async dispatch<T>(input: DispatchInput<T>): Promise<DispatchOutput<T>> {
        const cached = await this.deps.idempotencyStore.get(
            input.userId,
            input.commandId,
        );
        if (cached) {
            return {
                result: cached.body as T,
                httpStatus: cached.httpStatus,
                replay: true,
                events: [],
            };
        }

        const payload = await input.handler();
        const httpStatus = payload.httpStatus ?? 200;
        const correlationId = input.correlationId ?? input.commandId;
        const causationId = input.causationId ?? null;

        if (payload.events.length === 0) {
            // Pure read-side command (e.g., redrive). Still write the idempotency
            // row so retries don't re-run the handler.
            const idem = this.idempotencyRow(input, payload.result, httpStatus);
            await this.deps.eventStore.appendCommand({
                events: [],
                idempotency: idem,
            });
            return { result: payload.result, httpStatus, replay: false, events: [] };
        }

        const seqs = await this.deps.eventStore.allocateSeqs(
            input.raceId,
            payload.events.length,
        );
        const events: RaceEvent[] = payload.events.map((draft, i) => ({
            raceId: input.raceId,
            seq: seqs[i],
            type: draft.type,
            occurredAt: draft.occurredAt ?? new Date(input.clock.epochMs()).toISOString(),
            actorId: draft.actorId,
            payload: draft.payload,
            commandId: input.commandId,
            causationId,
            correlationId,
        }));

        const channelsFor = payload.outboxChannelsFor ?? defaultChannelsFor;
        const outboxEntries: OutboxEntry[] = [];
        const enqueuedAt = new Date(input.clock.epochMs()).toISOString();
        for (let i = 0; i < events.length; i++) {
            const channels = channelsFor(payload.events[i], i);
            for (const channel of channels) {
                outboxEntries.push({
                    id: input.newOutboxId(),
                    raceId: events[i].raceId,
                    eventSeq: events[i].seq,
                    eventType: events[i].type,
                    channel,
                    payload: events[i].payload,
                    attempts: 0,
                    enqueuedAt,
                    nextAttemptAt: enqueuedAt,
                });
            }
        }

        const idempotency = this.idempotencyRow(input, payload.result, httpStatus);

        try {
            await this.deps.eventStore.appendCommand({
                events,
                outboxEntries,
                idempotency,
            });
        } catch (e) {
            if (e instanceof TransactionConflictError) {
                // Distinguish "another writer used this commandId first" from
                // "something else collided" by re-reading the idempotency row.
                const existing = await this.deps.idempotencyStore.get(
                    input.userId,
                    input.commandId,
                );
                if (existing) {
                    return {
                        result: existing.body as T,
                        httpStatus: existing.httpStatus,
                        replay: true,
                        events: [],
                    };
                }
            }
            throw e;
        }

        return { result: payload.result, httpStatus, replay: false, events };
    }

    private idempotencyRow<T>(
        input: DispatchInput<T>,
        body: T,
        httpStatus: number,
    ) {
        return {
            userId: input.userId,
            commandId: input.commandId,
            httpStatus,
            body,
            storedAt: new Date(input.clock.epochMs()).toISOString(),
            ttl: input.idempotencyTtlSeconds ?? DEFAULT_TTL_SECONDS,
        };
    }
}
