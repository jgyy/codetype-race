export const DEFAULT_DECAY_FACTOR = 0.25;
export const DEFAULT_DECAY_TARGET = 1200;

export function applyDecay(
    rating: number,
    factor: number = DEFAULT_DECAY_FACTOR,
    target: number = DEFAULT_DECAY_TARGET,
): number {
    if (factor < 0 || factor > 1) {
        throw new Error(`decay factor out of range [0,1]: ${factor}`);
    }
    return Math.round(rating + factor * (target - rating));
}
