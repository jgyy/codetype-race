/**
 * offlineSyncMachine — sibling of wsActor in the larger app graph. Owns
 * online/offline/visibility transitions and triggers a single drain pass
 * each time the device comes back online.
 *
 *   states: idle → online (drainOnce) → idle ; idle → offline → idle
 *   events: ONLINE | OFFLINE | VISIBLE | ENQUEUE | DRAIN_OK | DRAIN_FAIL
 *   context: { queueLength: number }
 *
 * Network calls are injected via the `drain` actor so the machine is
 * fully testable without IndexedDB or fetch.
 */
import { assign, fromPromise, setup } from "xstate";
import type { DrainSummary } from "../offline/queue";

interface Ctx {
  queueLength: number;
  lastError: string | null;
}

type Events =
  | { type: "ONLINE" }
  | { type: "OFFLINE" }
  | { type: "VISIBLE" }
  | { type: "ENQUEUE"; queueLength: number }
  | { type: "DRAIN_OK"; summary: DrainSummary }
  | { type: "DRAIN_FAIL"; error: string };

export const offlineSyncMachine = setup({
  types: {} as { context: Ctx; events: Events },
  actors: {
    drain: fromPromise<DrainSummary>(async () => ({
      attempted: 0,
      succeeded: 0,
      remaining: 0,
    })),
  },
}).createMachine({
  id: "offlineSync",
  initial: "idle",
  context: { queueLength: 0, lastError: null },
  on: {
    ENQUEUE: {
      actions: assign({ queueLength: ({ event }) => event.queueLength }),
    },
  },
  states: {
    idle: {
      on: {
        ONLINE: { target: "draining" },
        VISIBLE: { target: "draining", guard: ({ context }) => context.queueLength > 0 },
        OFFLINE: { target: "offline" },
      },
    },
    offline: {
      on: {
        ONLINE: { target: "draining" },
      },
    },
    draining: {
      invoke: {
        src: "drain",
        onDone: {
          target: "idle",
          actions: assign({
            queueLength: ({ event }) => event.output.remaining,
            lastError: () => null,
          }),
        },
        onError: {
          target: "idle",
          actions: assign({
            lastError: ({ event }) => String((event as { error: unknown }).error ?? "drain failed"),
          }),
        },
      },
    },
  },
});
