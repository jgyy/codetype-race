export const RACE_EVENT_TYPES = [
    "RACE_CREATED",
    "PLAYER_JOINED",
    "PLAYER_LEFT",
    "COUNTDOWN_STARTED",
    "RACE_STARTED",
    "CURSOR_PROGRESS",
    "PLAYER_FINISHED",
    "RACE_FINISHED",
    "RACE_CANCELLED",
    "PLAYER_FLAGGED",
    "CURSOR_DIGEST",
] as const;

export type RaceEventType = (typeof RACE_EVENT_TYPES)[number];

export interface RaceEvent {
    raceId: string;
    seq: number;
    type: RaceEventType;
    occurredAt: string;
    actorId: string | null;
    payload: Record<string, unknown>;
    commandId: string | null;
    causationId: string | null;
    correlationId: string;
}

export interface PlayerJoinedPayload {
    userId: string;
    displayName: string;
}
export interface CursorProgressPayload {
    userId: string;
    charsTyped: number;
    errors: number;
    accuracy: number;
}
export interface PlayerFinishedPayload {
    finishedAt: string;
    charsTyped: number;
    accuracy: number;
    wpm: number;
}
export interface PlayerFlaggedPayload {
    reason: string;
}
