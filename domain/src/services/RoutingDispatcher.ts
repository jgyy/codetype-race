import type { OutboxChannel, OutboxEntry } from "../events/OutboxEntry";
import type { OutboxDispatcher } from "../ports/OutboxStore";

export type ChannelHandler = (entry: OutboxEntry) => Promise<void>;

export class RoutingDispatcher implements OutboxDispatcher {
    constructor(
        private readonly handlers: Partial<Record<OutboxChannel, ChannelHandler>>,
    ) { }

    async dispatch(channel: OutboxChannel, entry: OutboxEntry): Promise<void> {
        const handler = this.handlers[channel];
        if (!handler) {
            throw new Error(`no handler registered for outbox channel: ${channel}`);
        }
        await handler(entry);
    }
}

export class LoggingDispatcher implements OutboxDispatcher {
    constructor(
        private readonly tag: string,
        private readonly sink: (line: string) => void = console.log,
    ) { }
    async dispatch(channel: OutboxChannel, entry: OutboxEntry): Promise<void> {
        this.sink(
            JSON.stringify({
                tag: this.tag,
                channel,
                outboxId: entry.id,
                raceId: entry.raceId,
                eventSeq: entry.eventSeq,
                eventType: entry.eventType,
            }),
        );
    }
}
