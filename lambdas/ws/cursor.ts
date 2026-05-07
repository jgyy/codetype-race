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

async function flush() {
    flushScheduled = false;
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

            const peers = await connections.listByRoom(roomId);
            const payload = {
                type: "cursor" as const,
                display_name: displayName,
                progress: state.progress,
            };
            await Promise.all(
                peers
                    .filter((id) => id !== connectionId)
                    .map((id) => postTo(id, payload).catch(() => false)),
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
