import { afterEach, beforeEach, describe, expect, test, mock } from "bun:test";
import { quests } from "../../src/repos/QuestsRepo";
import { rotateQuests } from "../../cron/rotateQuests";

let seedMock: ReturnType<typeof mock>;
let originalSeed: typeof quests.seedRotation;

beforeEach(() => {
    originalSeed = quests.seedRotation.bind(quests);
    seedMock = mock(async () => ({ written: 3 }));
    (quests as any).seedRotation = seedMock;
});
afterEach(() => {
    (quests as any).seedRotation = originalSeed;
});

describe("rotateQuests", () => {
    test("seeds daily on a non-Monday only", async () => {
        const r = await rotateQuests(new Date("2026-05-08T00:00:00Z")); // Friday
        expect(r.daily.rotationId).toBe("2026-05-08");
        expect(r.weekly).toBeUndefined();
        expect(seedMock).toHaveBeenCalledTimes(1);
    });

    test("seeds daily + weekly on Monday UTC", async () => {
        const r = await rotateQuests(new Date("2026-05-04T00:00:00Z")); // Monday
        expect(r.daily.rotationId).toBe("2026-05-04");
        expect(r.weekly).toBeDefined();
        expect(seedMock).toHaveBeenCalledTimes(2);
    });
});
