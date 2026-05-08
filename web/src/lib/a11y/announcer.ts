/**
 * Race-state announcer reducer. Pure, framework-free. Drives the
 * `aria-live="polite"` <RaceLiveRegion>.
 *
 * Design rules (Phase 12 spec):
 *  - Finished announces *exactly once*, regardless of repeated `finished` events.
 *  - All other announcements obey a per-region minimum gap (default 3000 ms).
 *  - `tick` announcements ("N characters left") only fire at the gap cadence —
 *    they never preempt overtook/fell, but they do reset the throttle window.
 *  - The reducer is the single source of truth for *what* gets announced;
 *    when to feed it events is the call site's job.
 */

export type AnnouncerEvent =
  | { type: "tick"; charsLeft: number; now: number }
  | { type: "finished"; wpm: number; accuracy: number; now: number }
  | { type: "overtook"; passedName: string; now: number }
  | { type: "fell"; passerName: string; now: number };

export interface AnnouncerState {
  lastAnnouncedAt: number;
  finishedAnnounced: boolean;
  message: string | null;
  /** Monotonic counter so equal messages still trigger React updates. */
  seq: number;
}

export const MIN_GAP_MS = 3000;

export function initialAnnouncerState(): AnnouncerState {
  return { lastAnnouncedAt: -Infinity, finishedAnnounced: false, message: null, seq: 0 };
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function reduceAnnouncer(
  state: AnnouncerState,
  event: AnnouncerEvent,
  minGapMs: number = MIN_GAP_MS,
): AnnouncerState {
  // Finished: exactly once, ignore any further finished events.
  if (event.type === "finished") {
    if (state.finishedAnnounced) return state;
    return {
      lastAnnouncedAt: event.now,
      finishedAnnounced: true,
      message: `You finished. ${Math.round(event.wpm)} WPM, ${pct(event.accuracy)} accuracy.`,
      seq: state.seq + 1,
    };
  }

  // Throttle every other event type.
  if (event.now - state.lastAnnouncedAt < minGapMs) return state;

  let message: string | null = null;
  switch (event.type) {
    case "overtook":
      message = `You passed ${event.passedName}.`;
      break;
    case "fell":
      message = `${event.passerName} passed you.`;
      break;
    case "tick":
      message = `${event.charsLeft} characters left.`;
      break;
  }
  if (!message) return state;
  return {
    ...state,
    lastAnnouncedAt: event.now,
    message,
    seq: state.seq + 1,
  };
}
