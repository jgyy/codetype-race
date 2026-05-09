import {
    MAX_OUTBOX_ATTEMPTS,
    backoffMs,
    type OutboxEntry,
} from "../events/OutboxEntry";
import type { Clock } from "../ports/Clock";
import type { OutboxClaim, OutboxDispatcher, OutboxStore } from "../ports/OutboxStore";

export interface PublishOutcome {
    claimed: number;
    acked: number;
    retried: number;
    deadLettered: number;
}

export interface DrainOptions {
    batchSize?: number;
    maxAttempts?: number;
}

export async function drainOnce(
    store: OutboxStore,
    dispatcher: OutboxDispatcher,
    clock: Clock,
    opts: DrainOptions = {},
): Promise<PublishOutcome> {
    const batchSize = opts.batchSize ?? 25;
    const maxAttempts = opts.maxAttempts ?? MAX_OUTBOX_ATTEMPTS;
    const now = new Date(clock.epochMs()).toISOString();
    const claims = await store.claim(now, batchSize);
    let acked = 0;
    let retried = 0;
    let deadLettered = 0;

    for (const claim of claims) {
        try {
            await dispatcher.dispatch(claim.entry.channel, claim.entry);
            await store.ack(claim);
            acked++;
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            const nextAttempt = claim.entry.attempts + 1;
            if (nextAttempt >= maxAttempts) {
                await store.deadLetter(claim, reason);
                deadLettered++;
            } else {
                const delay = backoffMs(nextAttempt);
                const at = new Date(clock.epochMs() + delay).toISOString();
                await store.fail(claim, at);
                retried++;
            }
        }
    }
    return { claimed: claims.length, acked, retried, deadLettered };
}

export function outboxEntryFor(args: {
    id: string;
    raceId: string;
    eventSeq: number;
    eventType: string;
    channel: OutboxEntry["channel"];
    payload: Record<string, unknown>;
    enqueuedAt: string;
}): OutboxEntry {
    return {
        ...args,
        attempts: 0,
        nextAttemptAt: args.enqueuedAt,
    };
}

export function isClaimReady(entry: OutboxEntry, nowIso: string): boolean {
    return entry.nextAttemptAt <= nowIso;
}

export function pickClaimable(
    entries: readonly OutboxEntry[],
    nowIso: string,
    limit: number,
): OutboxEntry[] {
    const ready = entries.filter((e) => isClaimReady(e, nowIso));
    ready.sort((a, b) => (a.nextAttemptAt < b.nextAttemptAt ? -1 : 1));
    return ready.slice(0, limit);
}

export type Claim = OutboxClaim;
