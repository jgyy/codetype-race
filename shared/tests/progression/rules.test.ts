import { describe, expect, test } from "bun:test";
import {
    ALL_RULES,
    RULES_BY_ID,
} from "../../src/progression/rules";
import { AchievementDefSchema } from "../../src/progression/achievements";
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

describe("ALL_RULES catalog", () => {
    test("exactly 10 launch rules", () => {
        expect(ALL_RULES.length).toBe(10);
    });

    test("every def passes Zod validation", () => {
        for (const r of ALL_RULES) {
            expect(() => AchievementDefSchema.parse(r.def)).not.toThrow();
        }
    });

    test("ids are unique", () => {
        const ids = ALL_RULES.map((r) => r.def.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test("RULES_BY_ID lookup works", () => {
        expect(RULES_BY_ID.first_race?.def.title).toBe("First Steps");
    });
});

describe("rule predicates — positive cases", () => {
    test("first_race fires on any RACE_FINISHED", () => {
        expect(
            RULES_BY_ID.first_race!.match(env({ type: "RACE_FINISHED" })),
        ).toBe(true);
    });

    test("perfect_accuracy needs accuracy=1", () => {
        expect(
            RULES_BY_ID.perfect_accuracy!.match(
                env({ type: "RACE_FINISHED", payload: { accuracy: 1 } }),
            ),
        ).toBe(true);
    });

    test("wpm_60 fires at exactly 60", () => {
        expect(
            RULES_BY_ID.wpm_60!.match(
                env({ type: "RACE_FINISHED", payload: { wpm: 60 } }),
            ),
        ).toBe(true);
    });

    test("rust_perfect needs both language and accuracy", () => {
        expect(
            RULES_BY_ID.rust_perfect!.match(
                env({
                    type: "RACE_FINISHED",
                    payload: { language: "rust", accuracy: 1 },
                }),
            ),
        ).toBe(true);
    });

    test("night_owl matches 03:00 UTC", () => {
        expect(
            RULES_BY_ID.night_owl!.match(
                env({
                    type: "RACE_FINISHED",
                    occurredAt: "2026-05-08T03:00:00.000Z",
                }),
            ),
        ).toBe(true);
    });
});

describe("rule predicates — negative cases", () => {
    test("perfect_accuracy rejects accuracy<1", () => {
        expect(
            RULES_BY_ID.perfect_accuracy!.match(
                env({ type: "RACE_FINISHED", payload: { accuracy: 0.99 } }),
            ),
        ).toBe(false);
    });

    test("wpm_100 rejects wpm=99", () => {
        expect(
            RULES_BY_ID.wpm_100!.match(
                env({ type: "RACE_FINISHED", payload: { wpm: 99 } }),
            ),
        ).toBe(false);
    });

    test("daily_done ignores RACE_FINISHED", () => {
        expect(
            RULES_BY_ID.daily_done!.match(env({ type: "RACE_FINISHED" })),
        ).toBe(false);
    });

    test("tourn_round_winner ignores DAILY_DONE", () => {
        expect(
            RULES_BY_ID.tourn_round_winner!.match(env({ type: "DAILY_DONE" })),
        ).toBe(false);
    });

    test("night_owl rejects 12:00 UTC", () => {
        expect(
            RULES_BY_ID.night_owl!.match(
                env({
                    type: "RACE_FINISHED",
                    occurredAt: "2026-05-08T12:00:00.000Z",
                }),
            ),
        ).toBe(false);
    });

    test("lang_python ignores rust race", () => {
        expect(
            RULES_BY_ID.lang_python!.match(
                env({
                    type: "RACE_FINISHED",
                    payload: { language: "rust" },
                }),
            ),
        ).toBe(false);
    });
});
