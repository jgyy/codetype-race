import type { DynamoDBStreamHandler } from "aws-lambda";
import { withStream } from "../src/middleware";
import { friends } from "../src/repos/FriendsRepo";
import { presence } from "../src/repos/PresenceRepo";
import { postTo } from "../src/wsClient";

interface PresenceChange {
    userId: string;
    kind: "online" | "offline";
}

// We emit `online` only on the first connection (INSERT into a previously
// empty PRESENCE#<user> partition) and `offline` only on the last (REMOVE
// of the only remaining row). Multi-tab connect/disconnect mid-session
// should not flicker friend lists.
function parseChange(record: any): PresenceChange | null {
    const keys = record.dynamodb?.Keys;
    const pk: string | undefined = keys?.PK?.S;
    const sk: string | undefined = keys?.SK?.S;
    if (!pk?.startsWith("PRESENCE#")) return null;
    if (!sk?.startsWith("CONN#")) return null;
    const userId = pk.slice("PRESENCE#".length);
    if (record.eventName === "INSERT") return { userId, kind: "online" };
    if (record.eventName === "REMOVE") return { userId, kind: "offline" };
    return null;
}

export const handler: DynamoDBStreamHandler = withStream(async (event) => {
    if (process.env.ENABLE_PRESENCE !== "true") return;
    const changes = event.Records.map(parseChange).filter(
        (c): c is PresenceChange => c !== null,
    );
    if (changes.length === 0) return;

    // Collapse multiple events for one user in this batch to a single
    // emission, evaluated against current row count.
    const byUser = new Map<string, PresenceChange>();
    for (const c of changes) byUser.set(c.userId, c);

    await Promise.all(
        Array.from(byUser.values()).map(async ({ userId, kind }) => {
            const conns = await presence.listConnections(userId);
            const isOnlineNow = conns.length > 0;
            // Edge filter: emit `online` only when transitioning to first
            // connection; `offline` only on last disconnect.
            if (kind === "online" && conns.length !== 1) return;
            if (kind === "offline" && isOnlineNow) return;

            const edges = await friends.listFriends(userId);
            const friendIds = edges
                .filter((e) => e.status === "accepted")
                .map((e) => (e.fromUserId === userId ? e.toUserId : e.fromUserId));
            if (friendIds.length === 0) return;

            const message =
                kind === "online"
                    ? { type: "friend-online" as const, user_id: userId }
                    : { type: "friend-offline" as const, user_id: userId };

            await Promise.all(
                friendIds.map(async (fid) => {
                    const fconns = await presence.listConnections(fid);
                    await Promise.all(
                        fconns.map((cid) => postTo(cid, message).catch(() => false)),
                    );
                }),
            );
        }),
    );
});
