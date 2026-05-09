export const OUTBOX_CHANNELS = [
    "broadcast",
    "progression",
    "analytics",
] as const;

export type OutboxChannel = (typeof OUTBOX_CHANNELS)[number];

export interface OutboxEntry {
    id: string;
    raceId: string;
    eventSeq: number;
    eventType: string;
    channel: OutboxChannel;
    payload: Record<string, unknown>;
    attempts: number;
    enqueuedAt: string;
    nextAttemptAt: string;
}

export const MAX_OUTBOX_ATTEMPTS = 6;

export function backoffMs(attempt: number): number {
    if (attempt < 0) throw new Error(`invalid attempt: ${attempt}`);
    const base = 250;
    const cap = 30_000;
    const exp = Math.min(cap, base * 2 ** attempt);
    return exp;
}
