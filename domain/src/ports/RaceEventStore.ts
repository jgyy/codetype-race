import type { RaceEvent } from "../events/RaceEvent";
import type { OutboxEntry } from "../events/OutboxEntry";
import type { IdempotencyRecord } from "./IdempotencyStore";

export interface AppendCommandArgs {
    /**
     * Events to append. `seq` must already be filled in (use `allocateSeqs` first).
     * The store applies an `attribute_not_exists(SK)` guard on each event row, so a
     * retry that re-uses the same seq fails atomically rather than silently
     * overwriting an existing event.
     */
    events: RaceEvent[];
    /** Outbox rows enqueued in the *same* transaction as the events. */
    outboxEntries?: OutboxEntry[];
    /** Idempotency row written conditionally (attribute_not_exists). */
    idempotency?: IdempotencyRecord;
}

export interface RaceEventStore {
    /**
     * Atomically reserves `count` consecutive seq numbers for the race.
     * Returns the reserved range as an ordered array.
     *
     * Implementation note: a single `ADD` to the per-race counter row, with
     * `UPDATED_NEW` so we get the post-increment value back in one round-trip.
     */
    allocateSeqs(raceId: string, count: number): Promise<number[]>;

    /**
     * Atomic multi-row write: events + (optional) outbox entries + (optional)
     * idempotency row, all in one TransactWriteItems. Either everything commits
     * or nothing does.
     */
    appendCommand(args: AppendCommandArgs): Promise<void>;

    /** List events for a race after `sinceSeq`, capped by `limit`. */
    listEvents(args: {
        raceId: string;
        sinceSeq: number;
        limit: number;
    }): Promise<RaceEvent[]>;
}

export class TransactionConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TransactionConflictError";
    }
}
