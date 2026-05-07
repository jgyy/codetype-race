export interface RaceParticipant {
    userId: string;
    rating: number;
    finishOrder: number;
}

export const DEFAULT_K = 32;

export function expectedScore(ra: number, rb: number): number {
    return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

export function computeRatingDeltas(
    participants: RaceParticipant[],
    k: number = DEFAULT_K,
): Record<string, number> {
    const out: Record<string, number> = {};
    if (participants.length < 2) {
        for (const p of participants) out[p.userId] = 0;
        return out;
    }
    for (const i of participants) {
        let total = 0;
        for (const j of participants) {
            if (i.userId === j.userId) continue;
            const expected = expectedScore(i.rating, j.rating);
            let actual: number;
            if (i.finishOrder < j.finishOrder) actual = 1;
            else if (i.finishOrder === j.finishOrder) actual = 0.5;
            else actual = 0;
            total += actual - expected;
        }
        out[i.userId] = Math.round((k * total) / (participants.length - 1));
    }
    return out;
}
