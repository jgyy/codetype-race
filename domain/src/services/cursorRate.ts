/**
 * Phase 16.5 — adaptive cursor flush rate policy.
 *
 * The server publishes a per-room rate based on room kind + player count;
 * clients clamp further by their own `lite` flag. A rate of 0 means "do
 * not broadcast cursors at all" (practice rooms / solo races); the room
 * stays interactive locally but no WS frames are sent.
 *
 * Returns Hz. To convert to a setTimeout interval: 1000 / rate, but
 * callers must guard against rate === 0 first.
 */
export type RoomKind = "race" | "practice" | "solo" | "tournament";

export interface CursorRateInput {
    kind: RoomKind;
    playerCount: number;
    /** Mobile / low-bandwidth client opt-in. Caps output at 5 Hz. */
    lite?: boolean;
}

const LITE_CAP_HZ = 5;

export function cursorRateHz(input: CursorRateInput): number {
    const { kind, playerCount, lite = false } = input;
    if (kind === "practice" || kind === "solo") return 0;
    if (playerCount <= 1) return 0;
    let rate: number;
    if (playerCount <= 2) rate = 10;
    else if (playerCount >= 5) rate = 20;
    else rate = 15; // 3–4 players: midpoint between the two anchors.
    return lite ? Math.min(rate, LITE_CAP_HZ) : rate;
}

/**
 * Convenience: returns the setTimeout interval (ms) for a given rate, or
 * null when rate === 0 (caller should skip broadcast entirely).
 */
export function cursorIntervalMs(rate: number): number | null {
    if (rate <= 0) return null;
    return Math.round(1000 / rate);
}
