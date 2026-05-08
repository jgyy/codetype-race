import type { PlayerState } from "@codetype/shared/progression/achievements";
import { users } from "../repos/UserRepo";

const EMPTY: PlayerState = {
    totalRaces: 0,
    racesWon: 0,
    bestWpmByLang: {},
    bestWpm: 0,
    langsRaced: [],
};

export async function loadPlayerState(userId: string): Promise<PlayerState> {
    try {
        const p = await users.getProfile(userId);
        if (!p) return EMPTY;
        const bestWpmByLang = (p as any).best_wpm ?? {};
        const wpms = Object.values(bestWpmByLang) as number[];
        return {
            totalRaces: Number((p as any).races_completed ?? 0),
            racesWon: Number((p as any).races_won ?? 0),
            bestWpmByLang,
            bestWpm: wpms.length ? Math.max(...wpms) : 0,
            langsRaced: Object.keys(bestWpmByLang),
        };
    } catch (e) {
        console.log(
            JSON.stringify({
                player_state_load_failed: { userId, err: String(e) },
            }),
        );
        return EMPTY;
    }
}

/** Per-batch cache. Caller is the stream Lambda; one cache per invocation. */
export class PlayerStateCache {
    private cache = new Map<string, Promise<PlayerState>>();
    get(userId: string): Promise<PlayerState> {
        let p = this.cache.get(userId);
        if (!p) {
            p = loadPlayerState(userId);
            this.cache.set(userId, p);
        }
        return p;
    }
}
