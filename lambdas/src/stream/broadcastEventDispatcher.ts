import type { Broadcaster, ConnectionRepo } from "@codetype/domain";
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
        const connectionIds = await this.deps.connections.listByRoom(entry.raceId);
        if (connectionIds.length === 0) return;
        const results = await Promise.all(
            connectionIds.map((id) =>
                this.deps.broadcaster
                    .postTo(id, frame)
                    .catch(() => false),
            ),
        );
        const liveCount = connectionIds.length;
        const okCount = results.filter(Boolean).length;
        if (liveCount > 0 && okCount === 0) {
            throw new Error(
                `broadcast for race ${entry.raceId} reached 0/${liveCount} connections`,
            );
        }
    }
}
