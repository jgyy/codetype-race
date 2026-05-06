export type RoomStatus = "lobby" | "countdown" | "running" | "finished";

export interface Room {
  room_id: string;
  code: string;
  host_id: string;
  snippet_id: string;
  status: RoomStatus;
  created_at: number;
  started_at?: number;
  finished_at?: number;
  version: number;
}

export interface Player {
  display_name: string;
  user_id?: string;
  joined_at: number;
  finished_at?: number;
  gross_wpm?: number;
  net_wpm?: number;
  accuracy?: number;
  scaled_wpm?: number;
  chars_typed: number;
  errors: number;
  progress: number;
  is_dnf?: boolean;
}

export interface Connection {
  connection_id: string;
  display_name: string;
  joined_at: number;
  ttl: number;
}

export interface Snippet {
  snippet_id: string;
  language: string;
  title: string;
  code: string;
  length: number;
}

export interface RaceResult extends Player {
  finished_at: number;
}

export type ClientToServer =
  | { action: "cursor"; progress: number; chars_typed: number; errors: number }
  | { action: "ping" }
  | { action: "start" }
  | { action: "finish"; chars_typed: number; errors: number };

export type ServerToClient =
  | { type: "cursor"; display_name: string; progress: number }
  | { type: "start"; started_at: number }
  | {
      type: "finish";
      display_name: string;
      gross_wpm: number;
      net_wpm: number;
      accuracy: number;
      scaled_wpm: number;
      finished_at: number;
    }
  | { type: "room-event"; event: "join" | "leave" | "status"; payload: unknown }
  | { type: "kicked" };
