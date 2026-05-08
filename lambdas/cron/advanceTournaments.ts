import { tournaments } from "../src/repos/TournamentRepo";
import { matches } from "../src/repos/MatchRepo";
import { seedTournament } from "../src/orchestration/seedTournament";

/**
 * Per-minute sweep:
 *   - registering tournaments past their `registrationClosesAt` get
 *     auto-seeded (CAS registering->seeding, write matches, ->running).
 *   - seeding tournaments are advanced to running (recovery for a stalled
 *     prior invocation).
 *
 * Forced advancement of stale `live` matches is intentionally not
 * implemented here yet — that requires a per-match TTL signal which
 * Phase 09's stream trigger covers in the happy path.
 */
export async function advanceTournaments(now: Date): Promise<{
    seeded: string[];
    promoted: string[];
}> {
    const out = { seeded: [] as string[], promoted: [] as string[] };

    const reg = await tournaments.listByStatus("registering");
    for (const t of reg) {
        if (new Date(t.registrationClosesAt).getTime() > now.getTime()) {
            continue;
        }
        const moved = await tournaments.transitionStatus(
            t.id,
            "registering",
            "seeding",
        );
        if (!moved) continue;
        try {
            await seedTournament({
                tournId: t.id,
                size: t.size,
                startsAt: t.startsAt,
                matches,
                tournaments,
            });
            await tournaments.transitionStatus(t.id, "seeding", "running");
            out.seeded.push(t.id);
        } catch (err) {
            console.error("seedTournament failed", t.id, err);
        }
    }

    const seedingNow = await tournaments.listByStatus("seeding");
    for (const t of seedingNow) {
        const ok = await tournaments.transitionStatus(
            t.id,
            "seeding",
            "running",
        );
        if (ok) out.promoted.push(t.id);
    }

    return out;
}

export const handler = async () => {
    const start = Date.now();
    const result = await advanceTournaments(new Date());
    console.log(
        JSON.stringify({
            feature: "tournaments",
            route: "cron:advanceTournaments",
            status: 200,
            ms: Date.now() - start,
            ...result,
        }),
    );
};
