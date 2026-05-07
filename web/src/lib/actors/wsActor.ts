import { fromCallback } from "xstate";
import { WS_API } from "../config";

export interface WsActorInput {
  code: string;
  displayName: string;
}

export type WsParentEvent =
  | { type: "WS_OPEN" }
  | { type: "WS_CLOSE" }
  | { type: "WS_ERROR"; message: string }
  | { type: "WS_MSG"; msg: any };

export type WsActorEvent =
  | { type: "SEND_CURSOR"; progress: number; chars_typed: number; errors: number }
  | { type: "SEND_START" }
  | { type: "SEND_FINISH"; chars_typed: number; errors: number }
  | { type: "CLOSE" };

/**
 * Lifetime-scoped WebSocket actor. The parent invokes this in
 * `connecting`/`lobby`/`countdown`/`racing`. When the state node owning
 * the invoke exits, XState calls cleanup → socket closes. Reconnection is
 * driven by the parent re-invoking this actor from `reconnecting`.
 */
export const wsActor = fromCallback<WsActorEvent, WsActorInput>(
  ({ input, sendBack, receive }) => {
    if (!WS_API) {
      sendBack({ type: "WS_ERROR", message: "WS_API not configured" });
      return () => {};
    }
    const url = `${WS_API}?code=${encodeURIComponent(
      input.code,
    )}&display_name=${encodeURIComponent(input.displayName)}`;
    const ws = new WebSocket(url);
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    ws.onopen = () => {
      sendBack({ type: "WS_OPEN" });
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: "ping" }));
        }
      }, 5000);
    };
    ws.onmessage = (e) => {
      try {
        sendBack({ type: "WS_MSG", msg: JSON.parse(e.data) });
      } catch {
        // ignore non-JSON frames
      }
    };
    ws.onerror = () => {
      sendBack({ type: "WS_ERROR", message: "socket error" });
    };
    ws.onclose = () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      if (!closed) sendBack({ type: "WS_CLOSE" });
    };

    receive((event) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      switch (event.type) {
        case "SEND_CURSOR":
          ws.send(
            JSON.stringify({
              action: "cursor",
              progress: event.progress,
              chars_typed: event.chars_typed,
              errors: event.errors,
            }),
          );
          return;
        case "SEND_START":
          ws.send(JSON.stringify({ action: "start" }));
          return;
        case "SEND_FINISH":
          ws.send(
            JSON.stringify({
              action: "finish",
              chars_typed: event.chars_typed,
              errors: event.errors,
            }),
          );
          return;
        case "CLOSE":
          closed = true;
          ws.close();
          return;
      }
    });

    return () => {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  },
);
