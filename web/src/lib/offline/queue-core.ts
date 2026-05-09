export interface PracticeRunEnvelope {
    id: string;
    finishedAt: number;
    snippetId: string;
    language: string;
    netWpm: number;
    grossWpm: number;
    scaledWpm: number;
    accuracy: number;
    charsTyped: number;
    errors: number;
    durationMs: number;
}

export const MAX_QUEUE = 100;

export function enqueueInto(
    current: PracticeRunEnvelope[],
    next: PracticeRunEnvelope,
    cap: number = MAX_QUEUE,
): PracticeRunEnvelope[] {
    const filtered = current.filter((r) => r.id !== next.id);
    filtered.push(next);
    while (filtered.length > cap) filtered.shift();
    return filtered;
}

export interface DrainOutcome {
    drained: PracticeRunEnvelope[];
    remaining: PracticeRunEnvelope[];
}

export function applyDrainResults(
    current: PracticeRunEnvelope[],
    results: Map<string, "ok" | "fail">,
): DrainOutcome {
    const drained: PracticeRunEnvelope[] = [];
    const remaining: PracticeRunEnvelope[] = [];
    for (const item of current) {
        if (results.get(item.id) === "ok") drained.push(item);
        else remaining.push(item);
    }
    return { drained, remaining };
}
