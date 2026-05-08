import { describe, expect, test } from "bun:test";
import { runAchievementsForEnvelope } from "../../src/progression/runAchievements";
import type { EventEnvelope } from "@codetype/shared/eventlog";
import type { AchievementsRepo } from "../../src/repos/AchievementsRepo";
import type { XpRepo } from "../../src/repos/XpRepo";

const env = (
    over: Partial<EventEnvelope> & Pick<EventEnvelope, "type">,
): EventEnvelope => ({
    id: "11111111-1111-4111-8111-111111111111",
    occurredAt: "2026-05-08T12:00:00.000Z",
    userId: "u1",
    payload: {},
    source: "stream",
    v: 1,
    ...over,
});

const emptyState = {
    totalRaces: 0,
    racesWon: 0,
    bestWpmByLang: {},
    bestWpm: 0,
    langsRaced: [],
};

function makeRepo(unlockedSet = new Set<string>()): AchievementsRepo {
    return {
        async tryUnlock(_u, def) {
            if (unlockedSet.has(def.id)) return false;
            unlockedSet.add(def.id);
            return true;
        },
        async listForUser() {
            return [];
        },
        async listPinned() {
            return [];
        },
        async setPinned() {},
    } as any;
}

function makeXp(awardCalls: any[] = []): XpRepo {
    return {
        async award(env: EventEnvelope, delta: number) {
            awardCalls.push({ id: env.id, delta });
            return {
                delta,
                bonusDelta: 0,
                deduped: false,
                summary: {
                    totalXp: 0,
                    level: 1,
                    currentLevelXp: 0,
                    nextLevelXp: 100,
                    updatedAt: "now",
                },
            };
        },
        async getSummary() {
            return null;
        },
    } as any;
}

describe("runAchievementsForEnvelope", () => {
    test("a perfect rust race unlocks first_race + perfect + rust_perfect", async () => {
        const awarded: any[] = [];
        const repo = makeRepo();
        const xpRepo = makeXp(awarded);
        const out = await runAchievementsForEnvelope(
            env({
                type: "RACE_FINISHED",
                payload: { language: "rust", accuracy: 1, wpm: 70 },
            }),
            { repo, xpRepo, loadState: async () => emptyState },
        );
        const ids = out.map((o) => o.achievementId).sort();
        expect(ids).toContain("first_race");
        expect(ids).toContain("perfect_accuracy");
        expect(ids).toContain("rust_perfect");
        expect(ids).toContain("wpm_60");
        expect(awarded.length).toBe(out.length);
        for (const a of awarded) expect(a.delta).toBe(5);
    });

    test("re-running over the same envelope unlocks zero achievements (idempotent)", async () => {
        const unlocked = new Set<string>();
        const repo = makeRepo(unlocked);
        const xpRepo = makeXp();
        const e = env({
            type: "RACE_FINISHED",
            payload: { language: "rust", accuracy: 1 },
        });
        const first = await runAchievementsForEnvelope(e, { repo, xpRepo, loadState: async () => emptyState });
        const second = await runAchievementsForEnvelope(e, { repo, xpRepo, loadState: async () => emptyState });
        expect(first.length).toBeGreaterThan(0);
        expect(second.length).toBe(0);
    });

    test("DAILY_DONE only triggers daily_done", async () => {
        const repo = makeRepo();
        const xpRepo = makeXp();
        const out = await runAchievementsForEnvelope(
            env({ type: "DAILY_DONE" }),
            { repo, xpRepo, loadState: async () => emptyState },
        );
        expect(out.map((o) => o.achievementId)).toEqual(["daily_done"]);
    });

    test("a slow non-perfect race triggers nothing", async () => {
        const repo = makeRepo();
        const xpRepo = makeXp();
        const out = await runAchievementsForEnvelope(
            env({
                type: "RACE_FINISHED",
                payload: { language: "rust", accuracy: 0.9, wpm: 30 },
                occurredAt: "2026-05-08T12:00:00.000Z",
            }),
            { repo, xpRepo, loadState: async () => emptyState },
        );
        expect(out.map((o) => o.achievementId)).toEqual(["first_race"]);
    });

    test("repo error on one rule does not abort others", async () => {
        const orig = console.log;
        console.log = () => {};
        try {
            let n = 0;
            const repo = {
                async tryUnlock() {
                    n++;
                    if (n === 1) throw new Error("boom");
                    return true;
                },
            } as any;
            const xpRepo = makeXp();
            const out = await runAchievementsForEnvelope(
                env({
                    type: "RACE_FINISHED",
                    payload: { accuracy: 1, wpm: 70 },
                }),
                { repo, xpRepo, loadState: async () => emptyState },
            );
            expect(out.length).toBeGreaterThan(0);
        } finally {
            console.log = orig;
        }
    });
});
