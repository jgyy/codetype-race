import type { RaceEvent } from "../events/RaceEvent";

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

export const DEFAULT_DIGEST_BUCKET_MS = 200;

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
        perBucket.set(bucket, sample);
    }

    const perPlayer: Record<string, CursorSample[]> = {};
    for (const [userId, byBucket] of buckets) {
        const samples = [...byBucket.values()].sort((a, b) => a.t - b.t);
        perPlayer[userId] = samples;
    }

    return { raceId, startedAt, finishedAt, bucketMs, perPlayer };
}

export function hasCursorDigest(events: readonly RaceEvent[]): boolean {
    return events.some((e) => e.type === "CURSOR_DIGEST");
}
