/**
 * Offline queue façade: combines pure core (dedupe + cap) with the IDB
 * adapter and a `drain()` that walks the queue and POSTs each envelope to
 * /me/practice-runs (idempotent on `id`).
 *
 * Slice 5a only exposes the building blocks. Wiring into practiceMachine
 * lands when slice 5b adds the starter-pack endpoint.
 */
import {
  applyDrainResults,
  enqueueInto,
  type PracticeRunEnvelope,
} from "./queue-core";
import { idbGetAll, idbReplaceAll } from "./idb";

const PRACTICE_RUNS_PATH = "/me/practice-runs";

export async function enqueue(envelope: PracticeRunEnvelope): Promise<number> {
  const current = await idbGetAll();
  const next = enqueueInto(current, envelope);
  await idbReplaceAll(next);
  return next.length;
}

export async function queueLength(): Promise<number> {
  const current = await idbGetAll();
  return current.length;
}

export interface DrainSummary {
  attempted: number;
  succeeded: number;
  remaining: number;
}

/**
 * `apiBase` and `authHeader` are passed in (rather than imported from
 * @/lib/api) so this module stays trivially mockable in tests.
 */
export async function drain(opts: {
  apiBase: string;
  authHeader?: string;
}): Promise<DrainSummary> {
  const current = await idbGetAll();
  if (current.length === 0) return { attempted: 0, succeeded: 0, remaining: 0 };

  const results = new Map<string, "ok" | "fail">();
  for (const item of current) {
    try {
      const res = await fetch(`${opts.apiBase}${PRACTICE_RUNS_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(opts.authHeader ? { authorization: opts.authHeader } : {}),
        },
        body: JSON.stringify(item),
      });
      results.set(item.id, res.ok ? "ok" : "fail");
    } catch {
      results.set(item.id, "fail");
    }
  }

  const { drained, remaining } = applyDrainResults(current, results);
  await idbReplaceAll(remaining);
  return {
    attempted: current.length,
    succeeded: drained.length,
    remaining: remaining.length,
  };
}
