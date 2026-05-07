import { fromCallback } from "xstate";

export interface CountdownInput {
  startedAt: number;
}

/**
 * Emits TICK events with the seconds remaining and a final COUNTDOWN_DONE
 * when the wall-clock reaches `startedAt`. Tick rate is 100ms so the visual
 * countdown feels live without spamming React.
 */
export const countdownActor = fromCallback<{ type: "STOP" }, CountdownInput>(
  ({ input, sendBack }) => {
    let done = false;
    const tick = () => {
      if (done) return;
      const remaining = Math.max(0, input.startedAt - Date.now());
      const seconds = Math.ceil(remaining / 1000);
      sendBack({ type: "TICK", value: seconds } as any);
      if (remaining <= 0) {
        done = true;
        sendBack({ type: "COUNTDOWN_DONE" } as any);
      }
    };
    tick();
    const id = setInterval(tick, 100);
    return () => {
      done = true;
      clearInterval(id);
    };
  },
);
