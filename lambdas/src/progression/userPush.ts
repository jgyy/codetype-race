import {
    ApiGatewayManagementApiClient,
    PostToConnectionCommand,
    GoneException,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { presence } from "../repos/PresenceRepo";

const endpoint = process.env.PRESENCE_WS_ENDPOINT;
const client = endpoint
    ? new ApiGatewayManagementApiClient({ endpoint })
    : null;

export type ProgressionToast =
    | { type: "XP_GAINED"; v: 1; delta: number; total_xp: number; level: number }
    | { type: "LEVEL_UP"; v: 1; level: number; total_xp: number }
    | {
          type: "ACHIEVEMENT_UNLOCKED";
          v: 1;
          achievement_id: string;
          xp_awarded: number;
      }
    | {
          type: "QUEST_COMPLETED";
          v: 1;
          quest_id: string;
          rotation_id: string;
      };

/**
 * Best-effort fan-out to all of a user's live presence connections.
 * Stale (GoneException) connections are silently dropped — the
 * presence row will TTL-expire on its own.
 */
export async function pushToUser(
    userId: string,
    payload: ProgressionToast,
): Promise<void> {
    if (!client) return;
    let connIds: string[] = [];
    try {
        connIds = await presence.listConnections(userId);
    } catch (e) {
        console.log(
            JSON.stringify({
                user_push_lookup_failed: { userId, err: String(e) },
            }),
        );
        return;
    }
    if (connIds.length === 0) return;

    await Promise.all(
        connIds.map(async (id) => {
            try {
                await client.send(
                    new PostToConnectionCommand({
                        ConnectionId: id,
                        Data: Buffer.from(JSON.stringify(payload)),
                    }),
                );
            } catch (e) {
                if (e instanceof GoneException) return;
                console.log(
                    JSON.stringify({
                        user_push_send_failed: {
                            userId,
                            err: String(e),
                        },
                    }),
                );
            }
        }),
    );
}
