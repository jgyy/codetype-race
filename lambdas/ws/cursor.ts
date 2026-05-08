import type { z } from "zod";
import type { WsCursorSchema } from "@codetype/shared/schemas";
import { rooms } from "../src/repos/RoomRepo";
import { connections } from "../src/repos/ConnectionRepo";
import { postTo } from "../src/wsClient";

type CursorMsg = z.infer<typeof WsCursorSchema>;

interface PendingState {
    progress: number;
    chars_typed: number;
    errors: number;
}

const pending = new Map<string, PendingState>();
const COALESCE_MS = 100;
let flushScheduled = false;

let flushTick = 0;

export function __resetCursorState() {
    pending.clear();
    flushScheduled = false;
    flushTick = 0;
}

export function shouldDeliverToPeer(opts: {
    cursorLite: boolean;
    tick: number;
}): boolean {
    if (!opts.cursorLite) return true;
    return opts.tick % 2 === 0;
}

async function flush() {
    flushScheduled = false;
    flushTick += 1;
    const tick = flushTick;
    const snapshot = new Map(pending);
    pending.clear();

    await Promise.all(
        Array.from(snapshot.entries()).map(async ([connectionId, state]) => {
            const conn = await connections.byConnectionId(connectionId);
            if (!conn) return;
            const roomId = conn.PK.slice("ROOM#".length);
            const displayName = conn.display_name;

            await rooms.updateProgress(
                roomId,
                displayName,
                state.progress,
                state.chars_typed,
                state.errors,
            );

            const peers = await connections.listRowsByRoom(roomId);
            const payload = {
                type: "cursor" as const,
                display_name: displayName,
                progress: state.progress,
            };
            await Promise.all(
                peers
                    .filter((p) => p.connection_id !== connectionId)
                    .filter((p) =>
                        shouldDeliverToPeer({ cursorLite: p.cursor_lite, tick }),
                    )
                    .map((p) => postTo(p.connection_id, payload).catch(() => false)),
            );
        }),
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
