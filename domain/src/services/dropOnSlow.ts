/**
 * Phase 16.7 — drop-on-slow broadcast policy.
 *
 * Healthy clients ack every frame they receive (or at least keep their
 * `last_ack_seq` close to the current frame seq). A stalled client falls
 * far behind — instead of waiting on its slow socket and dragging the
 * whole room's broadcast loop down, we **drop frames for that client
 * only** until either it catches up (recovery) or it accumulates
 * `DROP_DISCONNECT_THRESHOLD` consecutive drops (force-disconnect; client
 * reconnects and replays via Phase 14's seq-based catch-up over HTTP, so
 * the room itself stays unaffected).
 *
 * Default thresholds:
 * - `MAX_LAG_FRAMES = 100`: how many frames a connection may fall behind
 *   before we start dropping. With 20 Hz cursor flushes that's ~5 s of
 *   lag — well past any normal jitter, well under any reasonable
 *   reconnect time.
 * - `DROP_DISCONNECT_THRESHOLD = 5`: consecutive drops before we hard-
 *   disconnect. Five frames at 20 Hz is 250 ms — enough to be sure the
 *   client is genuinely stuck rather than briefly slow.
 */
export const MAX_LAG_FRAMES = 100;
export const DROP_DISCONNECT_THRESHOLD = 5;

/**
 * Returns true if the frame at `seq` should be dropped for a connection
 * whose most recent ack was `lastAckSeq`. A connection that has never
 * acked (last_ack_seq === undefined / 0) is treated as caught-up — we
 * only drop once we have evidence of lag, not on cold start.
 */
export function shouldDropFrame(
    seq: number,
    lastAckSeq: number | undefined,
    maxLagFrames = MAX_LAG_FRAMES,
): boolean {
    if (lastAckSeq === undefined || lastAckSeq === 0) return false;
    return seq - lastAckSeq > maxLagFrames;
}

/**
 * Returns true if a connection that has just dropped a frame has now
 * accumulated enough consecutive drops to be force-disconnected.
 */
export function shouldForceDisconnect(
    consecutiveDrops: number,
    threshold = DROP_DISCONNECT_THRESHOLD,
): boolean {
    return consecutiveDrops >= threshold;
}
