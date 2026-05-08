import { describe, expect, test, mock } from "bun:test";
import type { EventEnvelope } from "@codetype/shared/eventlog";
import {
    awardForEnvelope,
    baseDeltaFor,
} from "../../src/progression/awardXp";
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

describe("baseDeltaFor", () => {
    test.each([
        ["RACE_FINISHED", 10],
        ["DAILY_DONE", 30],
        ["TOURN_WON", 50],
        ["ACHIEVEMENT_UNLOCKED", 0],
    ] as const)("%s → %d", (type, expected) => {
        expect(baseDeltaFor(env({ type } as any))).toBe(expected);
    });
});

function fakeRepo(behavior: Partial<XpRepo>): XpRepo {
    return behavior as XpRepo;
}

describe("awardForEnvelope", () => {
    test("returns null for zero-delta event types", async () => {
        const calls: string[] = [];
        const repo = fakeRepo({
            getSummary: async () => {
                calls.push("get");
                return null;
            },
            award: async () => {
                calls.push("award");
                throw new Error("should not be called");
            },
        });
        const r = await awardForEnvelope(env({ type: "ACHIEVEMENT_UNLOCKED" }), repo);
        expect(r).toBeNull();
        expect(calls).toEqual([]);
    });

    test("RACE_FINISHED awards base + bonus and reports leveledUp", async () => {
        const repo = fakeRepo({
            getSummary: async () => null,
            award: async () => ({
                delta: 10,
                bonusDelta: 20,
                deduped: false,
                summary: {
                    totalXp: 30,
                    level: 1,
                    currentLevelXp: 30,
                    nextLevelXp: 100,
                    updatedAt: "now",
                },
            }),
        });
        const r = await awardForEnvelope(env({ type: "RACE_FINISHED" }), repo);
        expect(r).not.toBeNull();
        expect(r!.delta).toBe(10);
        expect(r!.bonusDelta).toBe(20);
        expect(r!.totalXp).toBe(30);
        expect(r!.leveledUp).toBe(false);
    });

    test("level transition is detected when post.level > pre.level", async () => {
        const repo = fakeRepo({
            getSummary: async () => ({
                totalXp: 95,
                level: 1,
                currentLevelXp: 95,
                nextLevelXp: 100,
                updatedAt: "now",
            }),
            award: async () => ({
                delta: 10,
                bonusDelta: 0,
                deduped: false,
                summary: {
                    totalXp: 105,
                    level: 2,
                    currentLevelXp: 5,
                    nextLevelXp: 282,
                    updatedAt: "now",
                },
            }),
        });
        const r = await awardForEnvelope(env({ type: "RACE_FINISHED" }), repo);
        expect(r!.leveledUp).toBe(true);
    });

    test("deduped award yields zero delta and no leveledUp", async () => {
        const repo = fakeRepo({
            getSummary: async () => ({
                totalXp: 200,
                level: 2,
                currentLevelXp: 100,
                nextLevelXp: 282,
                updatedAt: "now",
            }),
            award: async () => ({
                delta: 0,
                bonusDelta: 0,
                deduped: true,
                summary: {
                    totalXp: 200,
                    level: 2,
                    currentLevelXp: 100,
                    nextLevelXp: 282,
                    updatedAt: "now",
                },
            }),
        });
        const r = await awardForEnvelope(env({ type: "RACE_FINISHED" }), repo);
        expect(r!.delta).toBe(0);
        expect(r!.leveledUp).toBe(false);
    });

    test("swallows repo errors and logs", async () => {
        const errSpy = mock(() => {});
        const orig = console.log;
        console.log = errSpy;
        const repo = fakeRepo({
            getSummary: async () => null,
            award: async () => {
                throw new Error("ddb down");
            },
        });
        try {
            const r = await awardForEnvelope(env({ type: "DAILY_DONE" }), repo);
            expect(r).toBeNull();
            expect(errSpy).toHaveBeenCalled();
        } finally {
            console.log = orig;
        }
    });
});
