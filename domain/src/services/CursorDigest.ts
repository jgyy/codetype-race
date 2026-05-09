import type { RaceEvent } from "../events/RaceEvent";

/**
 * One downsampled cursor sample: time relative to race start (ms), with the
 * player's progress at that moment.
 */
export interface CursorSample {
    t: number;
    charsTyped: number;
    accuracy: number;
}

export interface CursorDigestPayload {
    raceId: string;
    startedAt: string;
    finishedAt: string | null;
    bucketMs: number;
    perPlayer: Record<string, CursorSample[]>;
}

/**
 * 5 Hz target downsampling. Cursor events are emitted at ~20 Hz (50 ms
 * windows); 4× downsampling yields one sample per 200 ms — enough for a
 * smooth replay timeline at much lower storage cost.
 */
export const DEFAULT_DIGEST_BUCKET_MS = 200;

/**
 * Downsample a chronological event list into a CURSOR_DIGEST payload. Pure;
 * does not consult the event store. Caller passes the full event log; this
 * function picks out RACE_STARTED / RACE_FINISHED for timestamps and groups
 * CURSOR_PROGRESS events by player + bucket, retaining the LATEST sample
 * within each bucket (so a player's furthest-progress in the window is
 * preserved).
 */
export function buildCursorDigest(
    events: readonly RaceEvent[],
    opts: { bucketMs?: number } = {},
): CursorDigestPayload | null {
    const bucketMs = opts.bucketMs ?? DEFAULT_DIGEST_BUCKET_MS;
    if (bucketMs <= 0) throw new Error(`invalid bucketMs: ${bucketMs}`);
    if (events.length === 0) return null;

    const raceId = events[0].raceId;
    let startedAt: string | null = null;
    let finishedAt: string | null = null;
    for (const ev of events) {
        if (ev.type === "RACE_STARTED" && !startedAt) startedAt = ev.occurredAt;
        if (ev.type === "RACE_FINISHED") finishedAt = ev.occurredAt;
    }
    if (!startedAt) return null;
    const startMs = Date.parse(startedAt);

    // Map<userId, Map<bucketIndex, CursorSample>>
    const buckets = new Map<string, Map<number, CursorSample>>();
    for (const ev of events) {
        if (ev.type !== "CURSOR_PROGRESS") continue;
        const userId = String(ev.payload.userId ?? ev.actorId ?? "");
        if (!userId) continue;
        const charsTyped = Number(ev.payload.charsTyped ?? 0);
        const accuracy = Number(ev.payload.accuracy ?? 1);
        const t = Math.max(0, Date.parse(ev.occurredAt) - startMs);
        const bucket = Math.floor(t / bucketMs);
        const sample: CursorSample = { t: bucket * bucketMs, charsTyped, accuracy };
        let perBucket = buckets.get(userId);
        if (!perBucket) {
            perBucket = new Map();
            buckets.set(userId, perBucket);
        }
        // Keep the latest cursor reading within the bucket — represents the
        // farthest the player progressed before the next bucket boundary.
        perBucket.set(bucket, sample);
    }

    const perPlayer: Record<string, CursorSample[]> = {};
    for (const [userId, byBucket] of buckets) {
        const samples = [...byBucket.values()].sort((a, b) => a.t - b.t);
        perPlayer[userId] = samples;
    }

    return { raceId, startedAt, finishedAt, bucketMs, perPlayer };
}

/** True if any CURSOR_DIGEST event already exists in the log. */
export function hasCursorDigest(events: readonly RaceEvent[]): boolean {
    return events.some((e) => e.type === "CURSOR_DIGEST");
}
