export type {
    Room,
    Player,
    Connection,
    Snippet,
    RoomStatus,
    WsClientMsg,
    WsServerMsg,
} from "./schemas";

import type { Player, WsClientMsg, WsServerMsg } from "./schemas";

export type RaceResult = Player & { finished_at: number };
export type ClientToServer = WsClientMsg;
export type ServerToClient = WsServerMsg;
