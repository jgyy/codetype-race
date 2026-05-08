import { describe, expect, test } from "bun:test";
import {
    DAILY_POOL,
    pickDailyQuests,
    pickWeeklyQuests,
    pickN,
    progressDeltasForEvent,
    ALL_QUEST_DEFS,
    QuestDefSchema,
    type QuestDef,
} from "../../src/progression/quests";
import type { EventEnvelope } from "../../src/eventlog";

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

describe("quest catalog", () => {
    test("every def passes Zod validation", () => {
        for (const q of Object.values(ALL_QUEST_DEFS)) {
            expect(() => QuestDefSchema.parse(q)).not.toThrow();
        }
    });
    test("ids are unique across pools", () => {
        const ids = Object.keys(ALL_QUEST_DEFS);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("pickN determinism", () => {
    test("same seed → same picks (order matters)", () => {
        const a = pickDailyQuests("2026-05-08");
        const b = pickDailyQuests("2026-05-08");
        expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    });

    test("different seeds → different picks", () => {
        const a = pickDailyQuests("2026-05-08").map((q) => q.id);
        const b = pickDailyQuests("2026-05-09").map((q) => q.id);
        expect(a).not.toEqual(b);
    });

    test("picks are unique within a rotation", () => {
        const ids = pickDailyQuests("2026-05-08").map((q) => q.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test("returns n items", () => {
        expect(pickDailyQuests("x", 3).length).toBe(3);
        expect(pickWeeklyQuests("x", 1).length).toBe(1);
    });

    test("returns whole pool if n >= pool size", () => {
        const all = pickN("seed", DAILY_POOL, 99);
        expect(all.length).toBe(DAILY_POOL.length);
    });
});

describe("progressDeltasForEvent", () => {
    const racesQuest: QuestDef = ALL_QUEST_DEFS.daily_3_races!;
    const wpmQuest: QuestDef = ALL_QUEST_DEFS.daily_wpm_80!;
    const tsQuest: QuestDef = ALL_QUEST_DEFS.daily_typescript!;
    const dailyQ: QuestDef = ALL_QUEST_DEFS.daily_challenge!;

    test("RACE_FINISHED increments races_completed", () => {
        const out = progressDeltasForEvent(
            env({ type: "RACE_FINISHED" }),
            [racesQuest],
        );
        expect(out).toEqual([{ questId: "daily_3_races", delta: 1 }]);
    });

    test("wpm_threshold only fires above threshold", () => {
        const lo = progressDeltasForEvent(
            env({ type: "RACE_FINISHED", payload: { wpm: 75 } }),
            [wpmQuest],
        );
        const hi = progressDeltasForEvent(
            env({ type: "RACE_FINISHED", payload: { wpm: 80 } }),
            [wpmQuest],
        );
        expect(lo).toEqual([]);
        expect(hi.length).toBe(1);
    });

    test("language_specific filters language", () => {
        const wrong = progressDeltasForEvent(
            env({
                type: "RACE_FINISHED",
                payload: { language: "rust" },
            }),
            [tsQuest],
        );
        const right = progressDeltasForEvent(
            env({
                type: "RACE_FINISHED",
                payload: { language: "typescript" },
            }),
            [tsQuest],
        );
        expect(wrong).toEqual([]);
        expect(right.length).toBe(1);
    });

    test("DAILY_DONE only triggers daily_challenge_done quests", () => {
        const out = progressDeltasForEvent(env({ type: "DAILY_DONE" }), [
            dailyQ,
            racesQuest,
        ]);
        expect(out.map((d) => d.questId)).toEqual(["daily_challenge"]);
    });
});
