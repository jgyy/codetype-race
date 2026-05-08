import {
    DynamoDBDocumentClient,
    DeleteCommand,
    GetCommand,
    QueryCommand,
    TransactWriteCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
    friendEdgePrefix,
    friendEdgeSK,
    friendRequestInboxPrefix,
    friendRequestInboxSK,
    userPK,
} from "@codetype/shared/ddb-keys";
import { ddb, TABLE } from "../ddb";
import { Errors } from "../AppError";

export type EdgeStatus = "pending" | "accepted" | "blocked";

export interface FriendEdgeRow {
    PK: string;
    SK: string;
    fromUserId: string;
    toUserId: string;
    status: EdgeStatus;
    createdAt: string;
    acceptedAt?: string;
}

export interface FriendRequestRow {
    PK: string;
    SK: string;
    fromUserId: string;
    toUserId: string;
    createdAt: string;
}

export class FriendsRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) { }

    async getEdge(
        owner: string,
        other: string,
    ): Promise<FriendEdgeRow | null> {
        const r = await this.client.send(
            new GetCommand({
                TableName: TABLE,
                Key: { PK: userPK(owner), SK: friendEdgeSK(other) },
            }),
        );
        return (r.Item as FriendEdgeRow | undefined) ?? null;
    }

    async listFriends(userId: string): Promise<FriendEdgeRow[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": userPK(userId),
                    ":sk": friendEdgePrefix(),
                },
            }),
        );
        return (r.Items as FriendEdgeRow[] | undefined) ?? [];
    }

    async listIncomingRequests(userId: string): Promise<FriendRequestRow[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": userPK(userId),
                    ":sk": friendRequestInboxPrefix(),
                },
                ScanIndexForward: false,
                Limit: 100,
            }),
        );
        return (r.Items as FriendRequestRow[] | undefined) ?? [];
    }

    async sendRequest(from: string, to: string): Promise<void> {
        if (from === to) throw Errors.BadRequest("cannot friend yourself");
        const now = new Date().toISOString();
        const notBlockedOrAccepted =
            "attribute_not_exists(PK) OR (#s <> :blocked AND #s <> :accepted)";
        try {
            await this.client.send(
                new TransactWriteCommand({
                    TransactItems: [
                        {
                            Put: {
                                TableName: TABLE,
                                Item: {
                                    PK: userPK(from),
                                    SK: friendEdgeSK(to),
                                    fromUserId: from,
                                    toUserId: to,
                                    status: "pending",
                                    createdAt: now,
                                },
                                ConditionExpression: notBlockedOrAccepted,
                                ExpressionAttributeNames: { "#s": "status" },
                                ExpressionAttributeValues: {
                                    ":blocked": "blocked",
                                    ":accepted": "accepted",
                                },
                            },
                        },
                        {
                            Put: {
                                TableName: TABLE,
                                Item: {
                                    PK: userPK(to),
                                    SK: friendEdgeSK(from),
                                    fromUserId: from,
                                    toUserId: to,
                                    status: "pending",
                                    createdAt: now,
                                },
                                ConditionExpression: notBlockedOrAccepted,
                                ExpressionAttributeNames: { "#s": "status" },
                                ExpressionAttributeValues: {
                                    ":blocked": "blocked",
                                    ":accepted": "accepted",
                                },
                            },
                        },
                        {
                            Put: {
                                TableName: TABLE,
                                Item: {
                                    PK: userPK(to),
                                    SK: friendRequestInboxSK(from, now),
                                    fromUserId: from,
                                    toUserId: to,
                                    createdAt: now,
                                },
                            },
                        },
                    ],
                }),
            );
        } catch (e) {
            if (e instanceof TransactionCanceledException) {
                throw Errors.Conflict("friend request not allowed");
            }
            throw e;
        }
    }

    async accept(recipient: string, requester: string): Promise<void> {
        const existing = await this.getEdge(recipient, requester);
        if (!existing) throw Errors.NotFound("friend request");
        if (existing.status === "blocked") {
            throw Errors.Forbidden();
        }
        if (existing.status === "accepted") return;
        if (existing.status !== "pending") {
            throw Errors.Conflict("not a pending request");
        }
        const now = new Date().toISOString();
        const acceptIfPending = "#s = :pending";
        const inbox = await this.findInboxRow(recipient, requester);
        const items: any[] = [
            {
                Update: {
                    TableName: TABLE,
                    Key: {
                        PK: userPK(recipient),
                        SK: friendEdgeSK(requester),
                    },
                    UpdateExpression: "SET #s = :accepted, acceptedAt = :now",
                    ConditionExpression: acceptIfPending,
                    ExpressionAttributeNames: { "#s": "status" },
                    ExpressionAttributeValues: {
                        ":accepted": "accepted",
                        ":pending": "pending",
                        ":now": now,
                    },
                },
            },
            {
                Update: {
                    TableName: TABLE,
                    Key: {
                        PK: userPK(requester),
                        SK: friendEdgeSK(recipient),
                    },
                    UpdateExpression: "SET #s = :accepted, acceptedAt = :now",
                    ConditionExpression: acceptIfPending,
                    ExpressionAttributeNames: { "#s": "status" },
                    ExpressionAttributeValues: {
                        ":accepted": "accepted",
                        ":pending": "pending",
                        ":now": now,
                    },
                },
            },
        ];
        if (inbox) {
            items.push({
                Delete: {
                    TableName: TABLE,
                    Key: { PK: inbox.PK, SK: inbox.SK },
                },
            });
        }
        try {
            await this.client.send(
                new TransactWriteCommand({ TransactItems: items }),
            );
        } catch (e) {
            if (e instanceof TransactionCanceledException) {
                throw Errors.Conflict("friend state changed");
            }
            throw e;
        }
    }

    private async findInboxRow(
        recipient: string,
        requester: string,
    ): Promise<FriendRequestRow | null> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": userPK(recipient),
                    ":sk": `FREQ#${requester}#`,
                },
                Limit: 1,
            }),
        );
        return (r.Items?.[0] as FriendRequestRow | undefined) ?? null;
    }

    async remove(a: string, b: string): Promise<void> {
        const inbox = await this.findInboxRow(a, b);
        const items: any[] = [
            {
                Delete: {
                    TableName: TABLE,
                    Key: { PK: userPK(a), SK: friendEdgeSK(b) },
                },
            },
            {
                Delete: {
                    TableName: TABLE,
                    Key: { PK: userPK(b), SK: friendEdgeSK(a) },
                },
            },
        ];
        if (inbox) {
            items.push({
                Delete: {
                    TableName: TABLE,
                    Key: { PK: inbox.PK, SK: inbox.SK },
                },
            });
        }
        await this.client.send(
            new TransactWriteCommand({ TransactItems: items }),
        );
    }

    async block(blocker: string, blocked: string): Promise<void> {
        if (blocker === blocked) throw Errors.BadRequest("cannot block self");
        const now = new Date().toISOString();
        const inbox = await this.findInboxRow(blocker, blocked);
        const items: any[] = [
            {
                Put: {
                    TableName: TABLE,
                    Item: {
                        PK: userPK(blocker),
                        SK: friendEdgeSK(blocked),
                        fromUserId: blocker,
                        toUserId: blocked,
                        status: "blocked",
                        createdAt: now,
                    },
                },
            },
            {
                Put: {
                    TableName: TABLE,
                    Item: {
                        PK: userPK(blocked),
                        SK: friendEdgeSK(blocker),
                        fromUserId: blocker,
                        toUserId: blocked,
                        status: "blocked",
                        createdAt: now,
                    },
                },
            },
        ];
        if (inbox) {
            items.push({
                Delete: {
                    TableName: TABLE,
                    Key: { PK: inbox.PK, SK: inbox.SK },
                },
            });
        }
        await this.client.send(
            new TransactWriteCommand({ TransactItems: items }),
        );
    }

    async deleteEdgeRow(pk: string, sk: string): Promise<void> {
        await this.client.send(
            new DeleteCommand({ TableName: TABLE, Key: { PK: pk, SK: sk } }),
        );
    }

    async touchAcceptedAt(
        userId: string,
        other: string,
        when: string,
    ): Promise<void> {
        await this.client.send(
            new UpdateCommand({
                TableName: TABLE,
                Key: { PK: userPK(userId), SK: friendEdgeSK(other) },
                UpdateExpression: "SET acceptedAt = :a",
                ExpressionAttributeValues: { ":a": when },
            }),
        );
    }
}

export const friends = new FriendsRepo();
