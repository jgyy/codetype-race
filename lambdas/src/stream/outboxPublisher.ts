import type { DynamoDBStreamEvent } from "aws-lambda";
import {
    ApiGwBroadcaster,
    DdbConnectionRepo,
    DdbOutboxStore,
    SystemClock,
} from "@codetype/adapters-aws";
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

import { ddb, TABLE } from "../ddb";
import { withStream } from "../middleware";
import { BroadcastEventDispatcher } from "./broadcastEventDispatcher";

const STREAM_DRAIN_BATCH = 25;

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

const connections = new DdbConnectionRepo({ table: TABLE, client: ddb });
const broadcaster = new ApiGwBroadcaster({
    endpoint: process.env.WS_ENDPOINT ?? "",
});
const broadcastDispatcher = new BroadcastEventDispatcher({
    connections,
    broadcaster,
});

const channelHandlers: Partial<Record<"broadcast" | "progression" | "analytics", ChannelHandler>> = {
    broadcast: (entry) => broadcastDispatcher.dispatch(entry),
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
