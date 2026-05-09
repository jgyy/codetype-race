import type { RaceEvent, RaceEventType } from "../events/RaceEvent";

export type RaceStatus =
    | "pending"
    | "lobby"
    | "countdown"
    | "racing"
    | "finished"
    | "cancelled";

export interface PlayerState {
    userId: string;
    displayName: string;
    charsTyped: number;
    errors: number;
    accuracy: number;
    wpm: number;
    finishedAt: string | null;
    flags: string[];
}

export interface RaceState {
    id: string | null;
    status: RaceStatus;
    players: Record<string, PlayerState>;
    countdownStartedAt: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    lastSeq: number;
}

export function initialRaceState(): RaceState {
    return {
        id: null,
        status: "pending",
        players: {},
        countdownStartedAt: null,
        startedAt: null,
        finishedAt: null,
        lastSeq: -1,
    };
}

function emptyPlayer(userId: string, displayName: string): PlayerState {
    return {
        userId,
        displayName,
        charsTyped: 0,
        errors: 0,
        accuracy: 1,
        wpm: 0,
        finishedAt: null,
        flags: [],
    };
}

function exhaustive(t: never): never {
    throw new Error(`unhandled RaceEvent type: ${String(t)}`);
}

export function reduce(
    state: RaceState | undefined,
    ev: RaceEvent,
): RaceState {
    const s = state ?? initialRaceState();
    const lastSeq = ev.seq > s.lastSeq ? ev.seq : s.lastSeq;
    const t = ev.type as RaceEventType;
    switch (t) {
        case "RACE_CREATED":
            return { ...s, id: ev.raceId, status: "lobby", lastSeq };
        case "PLAYER_JOINED": {
            const userId = String(ev.payload.userId ?? ev.actorId ?? "");
            const displayName = String(ev.payload.displayName ?? userId);
            if (!userId || s.players[userId]) return { ...s, lastSeq };
            return {
                ...s,
                players: { ...s.players, [userId]: emptyPlayer(userId, displayName) },
                lastSeq,
            };
        }
        case "PLAYER_LEFT": {
            const userId = String(ev.actorId ?? ev.payload.userId ?? "");
            if (!userId || !s.players[userId]) return { ...s, lastSeq };
            const next = { ...s.players };
            delete next[userId];
            return { ...s, players: next, lastSeq };
        }
        case "COUNTDOWN_STARTED":
            return {
                ...s,
                status: "countdown",
                countdownStartedAt: ev.occurredAt,
                lastSeq,
            };
        case "RACE_STARTED":
            return {
                ...s,
                status: "racing",
                startedAt: ev.occurredAt,
                lastSeq,
            };
        case "CURSOR_PROGRESS": {
            const userId = String(ev.payload.userId ?? ev.actorId ?? "");
            const p = s.players[userId];
            if (!p || p.finishedAt) return { ...s, lastSeq };
            const charsTyped = Number(ev.payload.charsTyped ?? p.charsTyped);
            const errors = Number(ev.payload.errors ?? p.errors);
            const accuracy = Number(ev.payload.accuracy ?? p.accuracy);
            const next: PlayerState =
                charsTyped >= p.charsTyped
                    ? { ...p, charsTyped, errors, accuracy }
                    : p;
            return { ...s, players: { ...s.players, [userId]: next }, lastSeq };
        }
        case "PLAYER_FINISHED": {
            const userId = String(ev.actorId ?? ev.payload.userId ?? "");
            const p = s.players[userId];
            if (!p || p.finishedAt) return { ...s, lastSeq };
            const charsTyped = Number(ev.payload.charsTyped ?? p.charsTyped);
            const accuracy = Number(ev.payload.accuracy ?? p.accuracy);
            const wpm = Number(ev.payload.wpm ?? p.wpm);
            const finishedAt = String(ev.payload.finishedAt ?? ev.occurredAt);
            return {
                ...s,
                players: {
                    ...s.players,
                    [userId]: { ...p, charsTyped, accuracy, wpm, finishedAt },
                },
                lastSeq,
            };
        }
        case "RACE_FINISHED":
            return {
                ...s,
                status: "finished",
                finishedAt: ev.occurredAt,
                lastSeq,
            };
        case "RACE_CANCELLED":
            return { ...s, status: "cancelled", lastSeq };
        case "CURSOR_DIGEST":
            return { ...s, lastSeq };
        case "PLAYER_FLAGGED": {
            const userId = String(ev.actorId ?? ev.payload.userId ?? "");
            const p = s.players[userId];
            const reason = String(ev.payload.reason ?? "unspecified");
            if (!p) return { ...s, lastSeq };
            return {
                ...s,
                players: {
                    ...s.players,
                    [userId]: { ...p, flags: [...p.flags, reason] },
                },
                lastSeq,
            };
        }
        default:
            return exhaustive(t);
    }
}

export function reduceAll(events: Iterable<RaceEvent>): RaceState {
    let s = initialRaceState();
    for (const ev of events) s = reduce(s, ev);
    return s;
}
