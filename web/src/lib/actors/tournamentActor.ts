import { fromCallback } from "xstate";
import { WS_TOURN_API } from "../config";
import type { BracketMatch } from "../api";

export interface TournamentActorInput {
    tournId: string;
    userId?: string;
}

export type TournamentParentEvent =
    | { type: "TOURN_OPEN" }
    | { type: "TOURN_CLOSE" }
    | { type: "TOURN_ERROR"; message: string }
    | { type: "BRACKET_INIT"; matches: BracketMatch[] }
    | { type: "BRACKET_UPDATE"; match: BracketMatch }
    | {
        type: "MATCH_READY";
        roomId: string;
        opensInMs: number;
        round: number;
        slot: number;
    }
    | { type: "MATCH_DONE"; round: number; slot: number; winnerId: string }
    | { type: "TOURNAMENT_FINISHED"; winnerId: string };

export type TournamentActorEvent = { type: "CLOSE" };

export const tournamentActor = fromCallback<
    TournamentActorEvent,
    TournamentActorInput
>(({ input, sendBack, receive }) => {
    if (!WS_TOURN_API) {
        sendBack({ type: "TOURN_ERROR", message: "WS_TOURN_API not configured" });
        return () => { };
    }
    const qs = new URLSearchParams({ tournId: input.tournId });
    if (input.userId) qs.set("userId", input.userId);
    const ws = new WebSocket(`${WS_TOURN_API}?${qs.toString()}`);
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    ws.onopen = () => {
        sendBack({ type: "TOURN_OPEN" });
        heartbeat = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "HEARTBEAT" }));
            }
        }, 25_000);
    };

    ws.onmessage = (e) => {
        let msg: { type: string;[k: string]: unknown };
        try {
            msg = JSON.parse(typeof e.data === "string" ? e.data : "");
        } catch {
            return;
        }
        switch (msg.type) {
            case "BRACKET_INIT":
                sendBack({
                    type: "BRACKET_INIT",
                    matches: (msg.matches ?? []) as BracketMatch[],
                });
                break;
            case "BRACKET_UPDATE":
                sendBack({
                    type: "BRACKET_UPDATE",
                    match: msg.match as BracketMatch,
                });
                break;
            case "MATCH_READY":
                sendBack({
                    type: "MATCH_READY",
                    roomId: String(msg.roomId),
                    opensInMs: Number(msg.opensInMs ?? 0),
                    round: Number(msg.round),
                    slot: Number(msg.slot),
                });
                break;
            case "MATCH_DONE":
                sendBack({
                    type: "MATCH_DONE",
                    round: Number(msg.round),
                    slot: Number(msg.slot),
                    winnerId: String(msg.winnerId),
                });
                break;
            case "TOURNAMENT_FINISHED":
                sendBack({
                    type: "TOURNAMENT_FINISHED",
                    winnerId: String(msg.winnerId),
                });
                break;
        }
    };

    ws.onerror = () => {
        if (!closed) sendBack({ type: "TOURN_ERROR", message: "ws error" });
    };

    ws.onclose = () => {
        if (!closed) sendBack({ type: "TOURN_CLOSE" });
    };

    receive((evt) => {
        if (evt.type === "CLOSE") {
            closed = true;
            ws.close();
        }
    });

    return () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (ws.readyState <= 1) ws.close();
    };
});
