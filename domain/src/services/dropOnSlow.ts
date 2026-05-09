export const MAX_LAG_FRAMES = 100;
export const DROP_DISCONNECT_THRESHOLD = 5;

export function shouldDropFrame(
    seq: number,
    lastAckSeq: number | undefined,
    maxLagFrames = MAX_LAG_FRAMES,
): boolean {
    if (lastAckSeq === undefined || lastAckSeq === 0) return false;
    return seq - lastAckSeq > maxLagFrames;
}

export function shouldForceDisconnect(
    consecutiveDrops: number,
    threshold = DROP_DISCONNECT_THRESHOLD,
): boolean {
    return consecutiveDrops >= threshold;
}
