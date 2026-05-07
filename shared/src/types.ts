// Re-export types inferred from schemas as the canonical types.
// Keeping this file as a stable import path during the schema migration.
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
