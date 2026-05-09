export type RoomKind = "race" | "practice" | "solo" | "tournament";

export interface CursorRateInput {
    kind: RoomKind;
    playerCount: number;
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

export function cursorIntervalMs(rate: number): number | null {
    if (rate <= 0) return null;
    return Math.round(1000 / rate);
}
