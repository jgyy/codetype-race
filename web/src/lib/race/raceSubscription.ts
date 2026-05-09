import { reduce, type RaceState } from "@codetype/domain/RaceReducer";
import type { RaceEvent } from "@codetype/domain/events/RaceEvent";
import type { WsServerEventAppend } from "@codetype/shared/schemas";

/**
 * Pulls events for a race after `sinceSeq`. The web client backs this with a
 * `fetch('/races/{id}/events?since=...')` round-trip; tests use a fake.
 */
export type EventsFetcher = (sinceSeq: number) => Promise<RaceEvent[]>;

export interface RaceSubscriptionListener {
    onState?: (state: RaceState) => void;
    onError?: (err: Error) => void;
}

/**
 * Convert an `event-append` WS frame into a RaceEvent. The frame is the same
 * shape the server emits via the broadcast outbox (slice 11a) — only the
 * commandId/causationId fields are stripped from the wire (clients don't need
 * them to reduce). We synthesise nullable defaults so reduce() can run.
 */
export function frameToEvent(frame: WsServerEventAppend): RaceEvent {
    return {
        raceId: frame.raceId,
        seq: frame.seq,
        type: frame.eventType as RaceEvent["type"],
        occurredAt: frame.occurredAt,
        actorId: frame.actorId,
        payload: frame.payload,
        commandId: null,
        causationId: null,
        correlationId: frame.correlationId,
    };
}

/**
 * Maintains a RaceState locally by applying server-pushed `event-append`
 * frames. On a seq gap (a frame arrives with seq > lastSeq + 1), enqueues a
 * single backfill fetch and re-applies in order. Concurrent gap detections
 * coalesce into one in-flight fetch.
 *
 * Pure DOM-free: no WebSocket here. Caller wires WS frames in via
 * applyFrame() and supplies the HTTP fetch via constructor.
 */
export class RaceSubscription {
    private state: RaceState;
    private buffer: Map<number, RaceEvent> = new Map();
    private inFlightBackfill: Promise<void> | null = null;
    private disposed = false;

    constructor(
        initialState: RaceState,
        private readonly fetchEvents: EventsFetcher,
        private readonly listener: RaceSubscriptionListener = {},
    ) {
        this.state = initialState;
    }

    getState(): RaceState {
        return this.state;
    }

    /** Replace the local state with a fresh server-supplied projection. */
    replaceState(state: RaceState): void {
        if (this.disposed) return;
        this.state = state;
        // Anything in the buffer with seq <= new lastSeq is now stale.
        for (const seq of this.buffer.keys()) {
            if (seq <= state.lastSeq) this.buffer.delete(seq);
        }
        this.flushBuffered();
        this.listener.onState?.(this.state);
    }

    /** Apply a single WS event-append frame. */
    async applyFrame(frame: WsServerEventAppend): Promise<void> {
        if (this.disposed) return;
        if (frame.raceId !== (this.state.id ?? frame.raceId)) {
            // State already bound to a different race; silently ignore.
            return;
        }
        const ev = frameToEvent(frame);
        await this.ingest(ev);
    }

    dispose(): void {
        this.disposed = true;
        this.buffer.clear();
    }

    private async ingest(ev: RaceEvent): Promise<void> {
        if (ev.seq <= this.state.lastSeq) return; // already applied
        const expected = this.state.lastSeq + 1;
        if (ev.seq === expected) {
            this.state = reduce(this.state, ev);
            this.listener.onState?.(this.state);
            this.flushBuffered();
            return;
        }
        // Gap detected — buffer the event and trigger backfill.
        this.buffer.set(ev.seq, ev);
        await this.triggerBackfill();
    }

    private flushBuffered(): void {
        let progressed = true;
        while (progressed) {
            progressed = false;
            const next = this.buffer.get(this.state.lastSeq + 1);
            if (next) {
                this.state = reduce(this.state, next);
                this.buffer.delete(next.seq);
                this.listener.onState?.(this.state);
                progressed = true;
            }
        }
    }

    private async triggerBackfill(): Promise<void> {
        if (this.inFlightBackfill) {
            await this.inFlightBackfill;
            return;
        }
        const sinceSeq = this.state.lastSeq;
        this.inFlightBackfill = (async () => {
            try {
                const fetched = await this.fetchEvents(sinceSeq);
                if (this.disposed) return;
                fetched.sort((a, b) => a.seq - b.seq);
                for (const ev of fetched) {
                    if (ev.seq <= this.state.lastSeq) continue;
                    if (ev.seq !== this.state.lastSeq + 1) {
                        // Still gapped after a backfill — server will eventually
                        // surface the missing seqs via either WS or another
                        // /events poll. Keep buffer; do not error.
                        this.buffer.set(ev.seq, ev);
                        continue;
                    }
                    this.state = reduce(this.state, ev);
                    this.listener.onState?.(this.state);
                }
                this.flushBuffered();
            } catch (err) {
                this.listener.onError?.(
                    err instanceof Error ? err : new Error(String(err)),
                );
            } finally {
                this.inFlightBackfill = null;
            }
        })();
        await this.inFlightBackfill;
    }
}
