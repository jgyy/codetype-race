import {
    applyDecay,
    DEFAULT_DECAY_FACTOR,
    DEFAULT_DECAY_TARGET,
} from "@codetype/shared/decay";
import {
    leaderboardGlobalPK,
} from "@codetype/shared/ddb-keys";
import type { Season } from "@codetype/shared/tournaments";
import { seasons } from "../src/repos/SeasonRepo";
import { users } from "../src/repos/UserRepo";

const PROFILE_PAGE_SIZE = 100;
const TOP_N_LEADERBOARD = 1000;

interface RolloverContext {
    now: Date;
}

/**
 * Daily season-rollover cron. Runs 00:00 UTC.
 *
 * For each active season whose `endsAt <= now`:
 *   1. CAS active->finalizing.
 *   2. Snapshot top-N leaderboard rows into SEASON#<id>#LB#* partitions
 *      (frozen via attribute_not_exists guard in SeasonRepo).
 *   3. Apply Elo decay to every profile, idempotent via the
 *      `decayAppliedFor=<seasonId>` sentinel.
 *   4. CAS finalizing->archived.
 *   5. Create the next upcoming season if not already present.
 *
 * Idempotency: every step is a no-op on retry. The acceptance criterion
 * "re-applies decay to no profile twice" is enforced by SeasonRepo's
 * applyDecayToProfile CAS.
 */
export async function rolloverSeasons(ctx: RolloverContext): Promise<{
    rolled: string[];
    decayed: number;
    snapshotted: number;
}> {
    const out = { rolled: [] as string[], decayed: 0, snapshotted: 0 };
    const active = await seasons.listByStatus("active");
    for (const s of active) {
        if (new Date(s.endsAt).getTime() > ctx.now.getTime()) continue;

        const moved = await seasons.transitionStatus(
            s.id,
            "active",
            "finalizing",
        );
        if (!moved) continue; // another invocation owns it

        out.snapshotted += await snapshotLeaderboard(s);
        out.decayed += await decayAllProfiles(s);

        await seasons.transitionStatus(s.id, "finalizing", "archived");
        out.rolled.push(s.id);

        await ensureNextSeason(s, ctx.now);
    }
    return out;
}

async function snapshotLeaderboard(season: Season): Promise<number> {
    const top = await users.listLeaderboard(
        leaderboardGlobalPK(),
        TOP_N_LEADERBOARD,
    );
    let written = 0;
    for (let i = 0; i < top.length; i++) {
        const row = top[i]!;
        try {
            await seasons.putLeaderboardRow({
                seasonId: season.id,
                language: "*",
                rank: i + 1,
                userId: row.user_id,
                displayName: row.display_name,
                rating: row.rating,
                racesPlayed: 0,
            });
            written++;
        } catch {
            // already frozen on a previous partial run; skip
        }
    }
    return written;
}

async function decayAllProfiles(season: Season): Promise<number> {
    let decayed = 0;
    let nextKey: Record<string, unknown> | undefined;
    const factor = season.decayFactor ?? DEFAULT_DECAY_FACTOR;
    const target = season.decayTarget ?? DEFAULT_DECAY_TARGET;
    do {
        const page = await users.pageProfiles(nextKey, PROFILE_PAGE_SIZE);
        for (const p of page.items) {
            const newRating = applyDecay(p.rating, factor, target);
            const ok = await users.applyDecayToProfile(
                p.user_id,
                newRating,
                season.id,
            );
            if (ok) decayed++;
        }
        nextKey = page.nextKey;
    } while (nextKey);
    return decayed;
}

const SEASON_DAYS = 90;

async function ensureNextSeason(prev: Season, now: Date): Promise<void> {
    // ID format YYYY-S<n>; bump n by 1 (wraps at S9 to next year S1).
    const [year, sn] = prev.id.split("-S");
    let nextYear = Number(year);
    let nextN = Number(sn) + 1;
    if (nextN > 9) {
        nextN = 1;
        nextYear += 1;
    }
    const nextId = `${nextYear}-S${nextN}`;
    const existing = await seasons.get(nextId);
    if (existing) return;
    const startsAt = new Date(prev.endsAt);
    const endsAt = new Date(startsAt.getTime() + SEASON_DAYS * 86_400_000);
    await seasons.create({
        id: nextId,
        status: "upcoming",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        decayFactor: prev.decayFactor,
        decayTarget: prev.decayTarget,
    });
    void now;
}

export const handler = async () => {
    const start = Date.now();
    const result = await rolloverSeasons({ now: new Date() });
    console.log(
        JSON.stringify({
            feature: "tournaments",
            route: "cron:rolloverSeasons",
            status: 200,
            ms: Date.now() - start,
            ...result,
        }),
    );
};
