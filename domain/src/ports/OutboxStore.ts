import type { OutboxChannel, OutboxEntry } from "../events/OutboxEntry";

export interface OutboxClaim {
    entry: OutboxEntry;
    /** Opaque token returned by the store; passed back to ack/fail. */
    receipt: unknown;
}

export interface OutboxStore {
    /** Pull up to `limit` ready entries (nextAttemptAt <= now). */
    claim(now: string, limit: number): Promise<OutboxClaim[]>;
    /** Mark a successfully-dispatched entry as done (delete the row). */
    ack(claim: OutboxClaim): Promise<void>;
    /** Reschedule with attempts+1 and a new nextAttemptAt. Pure-domain helpers compute the delay. */
    fail(claim: OutboxClaim, nextAttemptAt: string): Promise<void>;
    /** Dead-letter the entry — moved to DLQ partition. */
    deadLetter(claim: OutboxClaim, reason: string): Promise<void>;
}

export interface OutboxDispatcher {
    dispatch(channel: OutboxChannel, entry: OutboxEntry): Promise<void>;
}
