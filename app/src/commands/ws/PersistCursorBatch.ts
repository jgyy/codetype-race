import type { Broadcaster, ConnectionRepo } from "@codetype/domain";
import { Command, type CommandHandler } from "../../bus/Command";

const ROOM_PK_PREFIX = "ROOM#";

/**
 * Edge-side coalesced cursor flush.
 *
 * The WS handler accumulates per-connection updates over a 100ms
 * window, then dispatches this command with the captured snapshot
 * plus a global tick counter. The command persists each player's
 * progress and broadcasts to peers, honouring the phase-12 reduced-
 * cursor-stream policy (lite peers receive every other tick).
 *
 * Coalescing/setTimeout stays at the edge — it's a runtime concern,
 * not a domain rule. App owns the per-update fan-out logic.
 */
export interface CursorUpdate {
    connectionId: string;
    progress: number;
    chars_typed: number;
    errors: number;
}

export interface CursorPersistSink {
    updateProgress(
        roomId: string,
        displayName: string,
        progress: number,
        charsTyped: number,
        errors: number,
    ): Promise<void>;
}

export interface CursorPeerListSink {
    listRowsByRoom(roomId: string): Promise<
        Array<{
            connection_id: string;
            cursor_lite: boolean;
        }>
    >;
}

export interface PersistCursorBatchInput {
    updates: CursorUpdate[];
    /** Global flush-tick counter — used by the lite-peer policy. */
    tick: number;
}

export class PersistCursorBatchCommand extends Command<void> {
    constructor(public readonly input: PersistCursorBatchInput) {
        super();
    }
}

export function shouldDeliverToPeer(opts: {
    cursorLite: boolean;
    tick: number;
}): boolean {
    if (!opts.cursorLite) return true;
    return opts.tick % 2 === 0;
}

export class PersistCursorBatchHandler
    implements CommandHandler<PersistCursorBatchCommand> {
    constructor(
        private readonly connections: ConnectionRepo,
        private readonly persist: CursorPersistSink,
        private readonly peerLister: CursorPeerListSink,
        private readonly broadcaster: Broadcaster,
    ) { }

    async execute(c: PersistCursorBatchCommand): Promise<void> {
        const { updates, tick } = c.input;
        await Promise.all(
            updates.map(async (u) => {
                const conn = await this.connections.byConnectionId(u.connectionId);
                if (!conn) return;
                const roomId = conn.PK.slice(ROOM_PK_PREFIX.length);
                const displayName = conn.display_name;
                await this.persist.updateProgress(
                    roomId,
                    displayName,
                    u.progress,
                    u.chars_typed,
                    u.errors,
                );
                const peers = await this.peerLister.listRowsByRoom(roomId);
                const payload = {
                    type: "cursor" as const,
                    display_name: displayName,
                    progress: u.progress,
                };
                await Promise.all(
                    peers
                        .filter((p) => p.connection_id !== u.connectionId)
                        .filter((p) =>
                            shouldDeliverToPeer({
                                cursorLite: p.cursor_lite,
                                tick,
                            }),
                        )
                        .map((p) =>
                            this.broadcaster.postTo(p.connection_id, payload),
                        ),
                );
            }),
        );
    }
}
