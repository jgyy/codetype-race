import type { z } from "zod";
import type { WsCursorSchema } from "@codetype/shared/schemas";
import { commandBus, PersistCursorBatchCommand } from "./_container";
export { shouldDeliverToPeer } from "@codetype/app";

type CursorMsg = z.infer<typeof WsCursorSchema>;

interface PendingState {
    progress: number;
    chars_typed: number;
    errors: number;
}

const pending = new Map<string, PendingState>();
const COALESCE_MS = 100;
let flushScheduled = false;

/**
 * Phase 12 reduced-cursor-stream policy. The flush interval stays at
 * COALESCE_MS for everyone (the *coalescing* cadence). Lite peers
 * receive every other emission, halving wire-message rate without
 * special-casing the producer side. `flushTick` is the global counter.
 *
 * Phase 13 slice 13.6a: the persist + broadcast logic moved into
 * PersistCursorBatchCommand. The setTimeout/coalesce loop stays here
 * because it's a runtime concern, not a domain rule. On flush the
 * accumulated batch is dispatched as a single command.
 */
let flushTick = 0;

export function __resetCursorState() {
    pending.clear();
    flushScheduled = false;
    flushTick = 0;
}

async function flush() {
    flushScheduled = false;
    flushTick += 1;
    const tick = flushTick;
    const snapshot = Array.from(pending.entries()).map(([connectionId, s]) => ({
        connectionId,
        progress: s.progress,
        chars_typed: s.chars_typed,
        errors: s.errors,
    }));
    pending.clear();
    if (snapshot.length === 0) return;

    await commandBus.dispatch(
        new PersistCursorBatchCommand({ updates: snapshot, tick }),
    );
}

export async function applyCursor(
    input: CursorMsg,
    connectionId: string,
): Promise<void> {
    pending.set(connectionId, {
        progress: Math.max(0, Math.min(1, input.progress)),
        chars_typed: input.chars_typed | 0,
        errors: Math.max(0, input.errors | 0),
    });
    if (!flushScheduled) {
        flushScheduled = true;
        setTimeout(flush, COALESCE_MS);
    }
}
