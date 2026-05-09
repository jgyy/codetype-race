import type {
    Broadcaster,
    ConnectionRecord,
    ConnectionRepo,
} from "@codetype/domain";
import {
    shouldDropFrame,
    shouldForceDisconnect,
} from "@codetype/domain/dropOnSlow";
import type { OutboxEntry } from "@codetype/domain/events/OutboxEntry";
import type { WsServerEventAppend } from "@codetype/shared/schemas";

export interface BroadcastEventDispatcherDeps {
    connections: ConnectionRepo;
    broadcaster: Broadcaster;
}

export function frameFromOutbox(entry: OutboxEntry): WsServerEventAppend | null {
    const p = entry.payload;
    const occurredAt = p.occurredAt;
    const correlationId = p.correlationId;
    if (typeof occurredAt !== "string" || typeof correlationId !== "string") {
        return null;
    }
    const actorId =
        p.actorId === null
            ? null
            : typeof p.actorId === "string"
                ? p.actorId
                : null;
    const eventPayload =
        p.payload && typeof p.payload === "object" && !Array.isArray(p.payload)
            ? (p.payload as Record<string, unknown>)
            : {};
    return {
        type: "event-append",
        raceId: entry.raceId,
        seq: entry.eventSeq,
        eventType: entry.eventType,
        occurredAt,
        actorId,
        payload: eventPayload,
        correlationId,
    };
}

export class BroadcastEventDispatcher {
    constructor(private readonly deps: BroadcastEventDispatcherDeps) { }

    async dispatch(entry: OutboxEntry): Promise<void> {
        const frame = frameFromOutbox(entry);
        if (!frame) {
            throw new Error(
                `broadcast outbox entry ${entry.id} has malformed payload`,
            );
        }

        // Phase 16.7 — when the repo can return per-connection metadata,
        // apply drop-on-slow policy. Falls back to the old listByRoom-only
        // path when the adapter doesn't support listRowsByRoom (e.g. test
        // doubles). The fallback path treats every connection as caught-up.
        const rows = this.deps.connections.listRowsByRoom
            ? await this.deps.connections.listRowsByRoom(entry.raceId)
            : (await this.deps.connections.listByRoom(entry.raceId)).map(
                (id): ConnectionRecord => ({
                    connection_id: id,
                    display_name: "",
                    PK: "",
                    SK: "",
                }),
            );
        if (rows.length === 0) return;

        const seq = entry.eventSeq;
        let okCount = 0;
        let dropCount = 0;
        const sends = rows.map(async (row) => {
            const id = row.connection_id;
            if (shouldDropFrame(seq, row.last_ack_seq)) {
                dropCount++;
                const drops =
                    (await this.deps.connections.incrementConsecutiveDrops?.(id)) ??
                    (row.consecutive_drops ?? 0) + 1;
                if (shouldForceDisconnect(drops)) {
                    await this.deps.broadcaster.disconnect?.(id);
                }
                return false;
            }
            const ok = await this.deps.broadcaster.postTo(id, frame).catch(() => false);
            if (ok) {
                okCount++;
                // Don't reset every frame — last_ack_seq updates from the
                // ack handler also reset drops. Avoid the extra DDB write.
            }
            return ok;
        });
        await Promise.all(sends);

        const liveCount = rows.length;
        if (liveCount > 0 && okCount === 0 && dropCount === 0) {
            // Every send failed for non-policy reasons (e.g. transient API
            // GW errors); surface the failure so the outbox retries.
            throw new Error(
                `broadcast for race ${entry.raceId} reached 0/${liveCount} connections`,
            );
        }
    }
}
