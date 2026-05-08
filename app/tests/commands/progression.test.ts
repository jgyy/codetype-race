import { describe, expect, test } from "bun:test";
import { DomainError } from "@codetype/domain";
import {
    AchievementsSink,
    ClaimQuestCommand,
    ClaimQuestHandler,
    PinAchievementsCommand,
    PinAchievementsHandler,
    QuestProgressLite,
    QuestsSink,
} from "../../src";

class FakeQuests implements QuestsSink {
    progress = new Map<string, QuestProgressLite>();
    claimReturn = true;
    seedProgress(userId: string, rotationId: string, questId: string, p: QuestProgressLite) {
        this.progress.set(`${userId}|${rotationId}|${questId}`, p);
        return this;
    }
    async getProgress(userId: string, rotationId: string, questId: string) {
        return this.progress.get(`${userId}|${rotationId}|${questId}`) ?? null;
    }
    claimCalls: Array<{ userId: string; rotationId: string; def: { id: string } }> = [];
    async claim(userId: string, rotationId: string, def: { id: string; target: number; xp: number }) {
        this.claimCalls.push({ userId, rotationId, def });
        return this.claimReturn;
    }
}

const def = { id: "q1", target: 5, xp: 100 };

describe("ClaimQuestCommand", () => {
    test("404 when no progress row", async () => {
        await expect(
            new ClaimQuestHandler(new FakeQuests()).execute(
                new ClaimQuestCommand({ userId: "u1", rotationId: "d-1", def }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("409 when already claimed", async () => {
        const quests = new FakeQuests().seedProgress("u1", "d-1", "q1", {
            progress: 5,
            claimed: true,
        });
        await expect(
            new ClaimQuestHandler(quests).execute(
                new ClaimQuestCommand({ userId: "u1", rotationId: "d-1", def }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("409 when progress < target", async () => {
        const quests = new FakeQuests().seedProgress("u1", "d-1", "q1", {
            progress: 2,
            claimed: false,
        });
        await expect(
            new ClaimQuestHandler(quests).execute(
                new ClaimQuestCommand({ userId: "u1", rotationId: "d-1", def }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("happy path claims and returns xp_awarded", async () => {
        const quests = new FakeQuests().seedProgress("u1", "d-1", "q1", {
            progress: 5,
            claimed: false,
        });
        const out = await new ClaimQuestHandler(quests).execute(
            new ClaimQuestCommand({ userId: "u1", rotationId: "d-1", def }),
        );
        expect(out).toEqual({ claimed: true, quest_id: "q1", xp_awarded: 100 });
        expect(quests.claimCalls).toHaveLength(1);
    });

    test("409 on race-conflict from sink", async () => {
        const quests = new FakeQuests().seedProgress("u1", "d-1", "q1", {
            progress: 5,
            claimed: false,
        });
        quests.claimReturn = false;
        await expect(
            new ClaimQuestHandler(quests).execute(
                new ClaimQuestCommand({ userId: "u1", rotationId: "d-1", def }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });
});

class FakeAchievements implements AchievementsSink {
    owned = new Set<string>();
    pinned: Array<{ userId: string; slots: string[] }> = [];
    seed(...ids: string[]) {
        for (const id of ids) this.owned.add(id);
        return this;
    }
    async listForUser(_userId: string) {
        return [...this.owned].map((id) => ({ achievement_id: id }));
    }
    async setPinned(userId: string, slots: string[]) {
        this.pinned.push({ userId, slots });
    }
}

describe("PinAchievementsCommand", () => {
    const known = new Set(["a", "b", "c"]);

    test("rejects duplicate slots", async () => {
        await expect(
            new PinAchievementsHandler(new FakeAchievements()).execute(
                new PinAchievementsCommand({
                    userId: "u1",
                    slots: ["a", "a"],
                    knownIds: known,
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("rejects unknown ids", async () => {
        await expect(
            new PinAchievementsHandler(new FakeAchievements()).execute(
                new PinAchievementsCommand({
                    userId: "u1",
                    slots: ["unknown"],
                    knownIds: known,
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("rejects unowned ids", async () => {
        await expect(
            new PinAchievementsHandler(new FakeAchievements().seed("a")).execute(
                new PinAchievementsCommand({
                    userId: "u1",
                    slots: ["b"],
                    knownIds: known,
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("happy path persists slots", async () => {
        const ach = new FakeAchievements().seed("a", "b");
        const out = await new PinAchievementsHandler(ach).execute(
            new PinAchievementsCommand({
                userId: "u1",
                slots: ["a", "b"],
                knownIds: known,
            }),
        );
        expect(out).toEqual({ pinned: ["a", "b"] });
        expect(ach.pinned).toEqual([{ userId: "u1", slots: ["a", "b"] }]);
    });
});
