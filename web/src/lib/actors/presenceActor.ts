import { fromCallback } from "xstate";
import { WS_PRESENCE_API } from "../config";

export interface PresenceActorInput {
    userId: string;
}

export type PresenceParentEvent =
    | { type: "PRESENCE_OPEN" }
    | { type: "PRESENCE_CLOSE" }
    | { type: "PRESENCE_ERROR"; message: string }
    | { type: "FRIEND_ONLINE"; userId: string }
    | { type: "FRIEND_OFFLINE"; userId: string };

export type PresenceActorEvent = { type: "CLOSE" };

const PING_INTERVAL_MS = 30_000;

export const presenceActor = fromCallback<
    PresenceActorEvent,
    PresenceActorInput
>(({ input, sendBack, receive }) => {
    if (!WS_PRESENCE_API) {
        sendBack({
            type: "PRESENCE_ERROR",
            message: "WS_PRESENCE_API not configured",
        });
        return () => { };
    }
    const url = `${WS_PRESENCE_API}?user_id=${encodeURIComponent(input.userId)}`;
    const ws = new WebSocket(url);
    let pinger: ReturnType<typeof setInterval> | null = null;

    ws.onopen = () => {
        sendBack({ type: "PRESENCE_OPEN" });
        pinger = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: "ping" }));
            }
        }, PING_INTERVAL_MS);
    };

    ws.onmessage = (e) => {
        let msg: { type?: string; user_id?: string };
        try {
            msg = JSON.parse(typeof e.data === "string" ? e.data : "");
        } catch {
            return;
        }
        if (msg.type === "friend-online" && msg.user_id) {
            sendBack({ type: "FRIEND_ONLINE", userId: msg.user_id });
        } else if (msg.type === "friend-offline" && msg.user_id) {
            sendBack({ type: "FRIEND_OFFLINE", userId: msg.user_id });
        }
    };

    ws.onclose = () => sendBack({ type: "PRESENCE_CLOSE" });
    ws.onerror = () =>
        sendBack({ type: "PRESENCE_ERROR", message: "websocket error" });

    receive((event) => {
        if (event.type === "CLOSE") ws.close();
    });

    return () => {
        if (pinger) clearInterval(pinger);
        ws.close();
    };
});
