/**
 * Pure logic for the offline-runs queue. Storage adapter (IndexedDB,
 * memory-Map fixture, etc.) is plugged in by callers — keeps this module
 * trivially testable without browser globals.
 */

export interface PracticeRunEnvelope {
  id: string;
  finishedAt: number;
  snippetId: string;
  language: string;
  netWpm: number;
  grossWpm: number;
  scaledWpm: number;
  accuracy: number;
  charsTyped: number;
  errors: number;
  durationMs: number;
}

export const MAX_QUEUE = 100;

/**
 * Returns the next queue contents after enqueuing one envelope:
 *  - Existing entries with the same `id` are replaced (dedupe).
 *  - Oldest-first eviction when the cap is exceeded.
 *  - Stable order: existing items keep their position; the new/updated
 *    item moves to the end.
 */
export function enqueueInto(
  current: PracticeRunEnvelope[],
  next: PracticeRunEnvelope,
  cap: number = MAX_QUEUE,
): PracticeRunEnvelope[] {
  const filtered = current.filter((r) => r.id !== next.id);
  filtered.push(next);
  while (filtered.length > cap) filtered.shift();
  return filtered;
}

export interface DrainOutcome {
  drained: PracticeRunEnvelope[];
  remaining: PracticeRunEnvelope[];
}

/**
 * Splits a queue into successfully-drained vs still-pending, given a per-id
 * pass/fail map. Caller is responsible for the actual network calls; this
 * just keeps the bookkeeping pure.
 */
export function applyDrainResults(
  current: PracticeRunEnvelope[],
  results: Map<string, "ok" | "fail">,
): DrainOutcome {
  const drained: PracticeRunEnvelope[] = [];
  const remaining: PracticeRunEnvelope[] = [];
  for (const item of current) {
    if (results.get(item.id) === "ok") drained.push(item);
    else remaining.push(item);
  }
  return { drained, remaining };
}
