import type { RaceEvent } from "../events/RaceEvent";
import {
    evaluateStats,
    type CheatSignal,
    type RunStats,
    type Thresholds,
} from "./anticheat";

export interface PlayerAntiCheatStats {
    raceId: string;
    playerId: string;
    startedAt: string | null;
    finishedAt: string | null;
    finalCharsTyped: number;
    finalAccuracy: number;
    lastCharsTyped: number;
    maxPosAdvance: number;
    cursorEventCount: number;
}

export function emptyPlayerAcStats(
    raceId: string,
    playerId: string,
): PlayerAntiCheatStats {
    return {
        raceId,
        playerId,
        startedAt: null,
        finishedAt: null,
        finalCharsTyped: 0,
        finalAccuracy: 1,
        lastCharsTyped: 0,
        maxPosAdvance: 0,
        cursorEventCount: 0,
    };
}

/**
 * Pure: derive a single player's anti-cheat stats from a chronological event
 * sequence. Tracks the largest single-event jump in charsTyped (paste signal)
 * and captures startedAt / finishedAt / final counters for downstream
 * evaluation.
 */
export function aggregateForPlayer(
    events: readonly RaceEvent[],
    playerId: string,
): PlayerAntiCheatStats {
    if (events.length === 0) {
        return emptyPlayerAcStats("", playerId);
    }
    const raceId = events[0].raceId;
    let s = emptyPlayerAcStats(raceId, playerId);

    for (const ev of events) {
        if (ev.type === "RACE_STARTED") {
            s = { ...s, startedAt: ev.occurredAt };
            continue;
        }
        if (ev.type === "CURSOR_PROGRESS") {
            const userId = String(ev.payload.userId ?? ev.actorId ?? "");
            if (userId !== playerId) continue;
            const charsTyped = Number(ev.payload.charsTyped ?? 0);
            const advance = charsTyped - s.lastCharsTyped;
            s = {
                ...s,
                cursorEventCount: s.cursorEventCount + 1,
                lastCharsTyped: charsTyped,
                maxPosAdvance:
                    advance > s.maxPosAdvance ? advance : s.maxPosAdvance,
            };
            continue;
        }
        if (ev.type === "PLAYER_FINISHED") {
            const actor = String(ev.actorId ?? ev.payload.userId ?? "");
            if (actor !== playerId) continue;
            const finishedAt = String(ev.payload.finishedAt ?? ev.occurredAt);
            const finalCharsTyped = Number(
                ev.payload.charsTyped ?? s.lastCharsTyped,
            );
            const finalAccuracy = Number(ev.payload.accuracy ?? 1);
            s = { ...s, finishedAt, finalCharsTyped, finalAccuracy };
            continue;
        }
    }
    return s;
}

/**
 * Convert the aggregated projection into RunStats and run the existing
 * heuristic evaluator. Returns an empty list when the player has not finished
 * (we only judge complete runs).
 */
export function evaluatePlayer(
    stats: PlayerAntiCheatStats,
    opts: { snippetLength?: number; thresholds?: Partial<Thresholds> } = {},
): CheatSignal[] {
    if (!stats.startedAt || !stats.finishedAt) return [];
    const durationMs =
        Date.parse(stats.finishedAt) - Date.parse(stats.startedAt);
    if (!Number.isFinite(durationMs) || durationMs <= 0) return [];
    const run: RunStats = {
        snippetLength: opts.snippetLength ?? stats.finalCharsTyped,
        durationMs,
        charsTyped: stats.finalCharsTyped,
        maxPosAdvance: stats.maxPosAdvance,
        totalKeystrokes: stats.cursorEventCount,
    };
    return evaluateStats(run, opts.thresholds);
}
