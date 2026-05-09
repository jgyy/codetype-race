import type { OutboxChannel, OutboxEntry } from "../events/OutboxEntry";
import type { OutboxDispatcher } from "../ports/OutboxStore";

export type ChannelHandler = (entry: OutboxEntry) => Promise<void>;

/**
 * Dispatcher that routes by `entry.channel` to a registered handler.
 * Throws on unregistered channels — better to fail fast than silently swallow,
 * since the outbox partition is supposed to drain to *something*.
 */
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

/** Logs each dispatch via the supplied sink. Useful as a default and in tests. */
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
