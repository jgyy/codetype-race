export type SeedSize = 4 | 8 | 16 | 32 | 64;

export interface Entrant {
    userId: string;
    rating: number;
}

export interface SeededSlot {
    userId: string | null;
    seedRank: number | null;
}

export interface FirstRoundMatch {
    slot: number;
    players: [SeededSlot, SeededSlot];
    isBye: boolean;
}

export const VALID_SIZES: readonly SeedSize[] = [4, 8, 16, 32, 64];

export function isValidSize(n: number): n is SeedSize {
    return (VALID_SIZES as readonly number[]).includes(n);
}

export function rankEntrants(entrants: readonly Entrant[]): Entrant[] {
    return [...entrants].sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
    });
}

export function bracketSeedOrder(size: SeedSize): number[] {
    let order: number[] = [1, 2];
    while (order.length < size) {
        const next: number[] = [];
        const pairTotal = order.length * 2 + 1;
        for (const seed of order) {
            next.push(seed);
            next.push(pairTotal - seed);
        }
        order = next;
    }
    return order;
}

export function seedFirstRound(
    entrants: readonly Entrant[],
    size: SeedSize,
): FirstRoundMatch[] {
    if (entrants.length > size) {
        throw new Error(
            `entrants ${entrants.length} exceeds tournament size ${size}`,
        );
    }
    const ranked = rankEntrants(entrants);
    const seedToEntrant = new Map<number, Entrant>();
    ranked.forEach((e, i) => seedToEntrant.set(i + 1, e));

    const order = bracketSeedOrder(size);
    const matches: FirstRoundMatch[] = [];
    for (let i = 0; i < size; i += 2) {
        const seedA = order[i];
        const seedB = order[i + 1];
        const a = seedToEntrant.get(seedA) ?? null;
        const b = seedToEntrant.get(seedB) ?? null;
        const slotA: SeededSlot = a
            ? { userId: a.userId, seedRank: seedA }
            : { userId: null, seedRank: null };
        const slotB: SeededSlot = b
            ? { userId: b.userId, seedRank: seedB }
            : { userId: null, seedRank: null };
        matches.push({
            slot: i / 2,
            players: [slotA, slotB],
            isBye: !a || !b,
        });
    }
    return matches;
}

export function totalRounds(size: SeedSize): number {
    return Math.log2(size);
}

export function firstRoundIndex(size: SeedSize): number {
    return totalRounds(size) - 1;
}
