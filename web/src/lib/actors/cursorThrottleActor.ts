import { fromCallback } from "xstate";

export type CursorEvent = {
  type: "CURSOR";
  progress: number;
  chars_typed: number;
  errors: number;
};

/**
 * Coalesces incoming CURSOR events into at most one outgoing FLUSH every
 * 50ms (= 20Hz). Trailing-edge: the last value wins for the window. The
 * parent listens for FLUSH events and forwards them to wsActor.
 */
export const cursorThrottleActor = fromCallback<CursorEvent>(
  ({ sendBack, receive }) => {
    const INTERVAL_MS = 50;
    let pending: Omit<CursorEvent, "type"> | null = null;
    let lastSent = 0;
    let scheduled: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      scheduled = null;
      if (!pending) return;
      lastSent = Date.now();
      sendBack({ type: "CURSOR_FLUSH", ...pending } as any);
      pending = null;
    };

    receive((event) => {
      if (event.type !== "CURSOR") return;
      pending = {
        progress: event.progress,
        chars_typed: event.chars_typed,
        errors: event.errors,
      };
      const since = Date.now() - lastSent;
      if (since >= INTERVAL_MS) {
        flush();
      } else if (!scheduled) {
        scheduled = setTimeout(flush, INTERVAL_MS - since);
      }
    });

    return () => {
      if (scheduled) clearTimeout(scheduled);
      pending = null;
    };
  },
);
