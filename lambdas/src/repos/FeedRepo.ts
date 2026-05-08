import { v4 as uuidv4 } from "uuid";
import {
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { feedPK, feedSK } from "@codetype/shared/ddb-keys";
import {
    FEED_PAGE_SIZE,
    type FeedEvent,
    type FeedEventType,
} from "@codetype/shared/social";
import { ddb, TABLE } from "../ddb";

interface FeedRow extends FeedEvent {
    PK: string;
    SK: string;
}

export class FeedRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) { }

    /**
     * Best-effort append. Feed writes are not on the critical path of
     * any user-facing flow, so we never throw — caller code already
     * has its primary commit done.
     *
     * Rows are unbounded for now; reads always page with Limit=50. A
     * trim cron is a follow-up.
     */
    async append(
        userId: string,
        type: FeedEventType,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const now = Date.now();
        const event: FeedEvent = {
            user_id: userId,
            event_id: uuidv4(),
            type,
            payload,
            created_at: new Date(now).toISOString(),
        };
        try {
            await this.client.send(
                new PutCommand({
                    TableName: TABLE,
                    Item: {
                        PK: feedPK(userId),
                        SK: feedSK(now, event.event_id),
                        ...event,
                    },
                }),
            );
        } catch (e) {
            console.error(JSON.stringify({ feed_append_failed: { userId, type, err: String(e) } }));
        }
    }

    async list(userId: string, limit = FEED_PAGE_SIZE): Promise<FeedEvent[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": feedPK(userId),
                    ":sk": "EV#",
                },
                Limit: limit,
            }),
        );
        return (r.Items as FeedRow[] | undefined) ?? [];
    }
}

export const feed = new FeedRepo();
