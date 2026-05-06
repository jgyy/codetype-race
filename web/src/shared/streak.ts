const MS_PER_DAY = 86_400_000;

export function utcDayKey(epochMs: number): string {
    const d = new Date(epochMs);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export function isConsecutiveUtcDay(prevKey: string, nextKey: string): boolean {
    const prev = Date.parse(`${prevKey}T00:00:00Z`);
    const next = Date.parse(`${nextKey}T00:00:00Z`);
    if (Number.isNaN(prev) || Number.isNaN(next)) return false;
    return next - prev === MS_PER_DAY;
}
