import type { RaceEvent } from "../events/RaceEvent";
import type { OutboxEntry } from "../events/OutboxEntry";
import type { IdempotencyRecord } from "./IdempotencyStore";

export interface AppendCommandArgs {
    events: RaceEvent[];
    outboxEntries?: OutboxEntry[];
    idempotency?: IdempotencyRecord;
}

export interface RaceEventStore {
    allocateSeqs(raceId: string, count: number): Promise<number[]>;

    appendCommand(args: AppendCommandArgs): Promise<void>;

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
