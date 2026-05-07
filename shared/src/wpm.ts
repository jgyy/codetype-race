const MS_PER_MIN = 60_000;
const CHARS_PER_WORD = 5;

export function grossWpm(charsTyped: number, elapsedMs: number): number {
    if (elapsedMs <= 0 || charsTyped <= 0) return 0;
    return charsTyped / CHARS_PER_WORD / (elapsedMs / MS_PER_MIN);
}

export function netWpm(
    charsTyped: number,
    errors: number,
    elapsedMs: number,
): number {
    if (elapsedMs <= 0) return 0;
    const minutes = elapsedMs / MS_PER_MIN;
    return Math.max(0, (charsTyped / CHARS_PER_WORD - errors) / minutes);
}

export function accuracy(charsTyped: number, errors: number): number {
    if (charsTyped <= 0) return 0;
    const raw = (charsTyped - errors) / charsTyped;
    if (raw < 0) return 0;
    if (raw > 1) return 1;
    return raw;
}

export function scaledWpm(
    charsTyped: number,
    errors: number,
    elapsedMs: number,
): number {
    return netWpm(charsTyped, errors, elapsedMs) * accuracy(charsTyped, errors);
}
