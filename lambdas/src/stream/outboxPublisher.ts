import type { DynamoDBStreamEvent } from "aws-lambda";
import { DdbOutboxStore } from "@codetype/adapters-aws";
import {
    drainOnce,
    type PublishOutcome,
} from "@codetype/domain/OutboxPublisher";
import {
    LoggingDispatcher,
    RoutingDispatcher,
    type ChannelHandler,
} from "@codetype/domain/RoutingDispatcher";
import type { Clock } from "@codetype/domain/ports";
import type { OutboxStore, OutboxDispatcher } from "@codetype/domain/ports";
import { SystemClock } from "@codetype/adapters-aws";

import { ddb, TABLE } from "../ddb";
import { withStream } from "../middleware";

const STREAM_DRAIN_BATCH = 25;

/**
 * Returns true if the stream batch contains *any* outbox INSERT.
 * Used to skip drain runs when the stream batch is purely race-event /
 * projection traffic — keeps Lambda invocations cheap.
 */
export function streamHasOutboxInsert(event: DynamoDBStreamEvent): boolean {
    for (const r of event.Records ?? []) {
        if (r.eventName !== "INSERT") continue;
        const pk = (r.dynamodb?.Keys?.PK as { S?: string } | undefined)?.S;
        if (pk === "OUTBOX") return true;
    }
    return false;
}

export interface PublishDeps {
    store: OutboxStore;
    dispatcher: OutboxDispatcher;
    clock: Clock;
}

export async function publishOnce(deps: PublishDeps): Promise<PublishOutcome> {
    return drainOnce(deps.store, deps.dispatcher, deps.clock, {
        batchSize: STREAM_DRAIN_BATCH,
    });
}

const channelHandlers: Partial<Record<"broadcast" | "progression" | "analytics", ChannelHandler>> = {
    // Slice 7 ships LoggingDispatcher per channel; concrete dispatchers
    // (ApiGw broadcast, EventBridge progression, Firehose analytics) land as
    // their own slices once each channel's payload shape is finalised.
    broadcast: (entry) =>
        new LoggingDispatcher("outbox.broadcast").dispatch("broadcast", entry),
    progression: (entry) =>
        new LoggingDispatcher("outbox.progression").dispatch(
            "progression",
            entry,
        ),
    analytics: (entry) =>
        new LoggingDispatcher("outbox.analytics").dispatch("analytics", entry),
};

const store = new DdbOutboxStore({ table: TABLE, client: ddb });
const dispatcher = new RoutingDispatcher(channelHandlers);
const clock = new SystemClock();

export const handler = withStream(async (event: DynamoDBStreamEvent) => {
    if (!streamHasOutboxInsert(event)) return;
    const outcome = await publishOnce({ store, dispatcher, clock });
    console.log(
        JSON.stringify({
            tag: "outboxPublisher.outcome",
            ...outcome,
        }),
    );
});
