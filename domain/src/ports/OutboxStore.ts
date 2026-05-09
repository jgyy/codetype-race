import type { OutboxChannel, OutboxEntry } from "../events/OutboxEntry";

export interface OutboxClaim {
    entry: OutboxEntry;
    receipt: unknown;
}

export interface OutboxStore {
    claim(now: string, limit: number): Promise<OutboxClaim[]>;
    ack(claim: OutboxClaim): Promise<void>;
    fail(claim: OutboxClaim, nextAttemptAt: string): Promise<void>;
    deadLetter(claim: OutboxClaim, reason: string): Promise<void>;
}

export interface OutboxDispatcher {
    dispatch(channel: OutboxChannel, entry: OutboxEntry): Promise<void>;
}
