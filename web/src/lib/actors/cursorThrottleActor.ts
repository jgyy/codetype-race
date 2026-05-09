import { fromCallback } from "xstate";

export type CursorEvent = {
    type: "CURSOR";
    progress: number;
    chars_typed: number;
    errors: number;
};

export interface CursorThrottleInput {
    intervalMs: number | null;
}

export const cursorThrottleActor = fromCallback<CursorEvent, CursorThrottleInput>(
    ({ sendBack, receive, input }) => {
        const intervalMs = input?.intervalMs ?? 50;
        const enabled = input?.intervalMs !== null;
        let pending: Omit<CursorEvent, "type"> | null = null;
        let lastSent = 0;
        let scheduled: ReturnType<typeof setTimeout> | null = null;

        const flush = () => {
            scheduled = null;
            if (!pending) return;
            lastSent = Date.now();
            sendBack({ type: "CURSOR_FLUSH", ...pending } as never);
            pending = null;
        };

        receive((event) => {
            if (event.type !== "CURSOR") return;
            if (!enabled) return;
            pending = {
                progress: event.progress,
                chars_typed: event.chars_typed,
                errors: event.errors,
            };
            const since = Date.now() - lastSent;
            if (since >= intervalMs) {
                flush();
            } else if (!scheduled) {
                scheduled = setTimeout(flush, intervalMs - since);
            }
        });

        return () => {
            if (scheduled) clearTimeout(scheduled);
            pending = null;
        };
    },
);
