import { describe, expect, test } from "bun:test";
import {
    LoggingDispatcher,
    RoutingDispatcher,
} from "../../src/services/RoutingDispatcher";
import type { OutboxEntry } from "../../src/events/OutboxEntry";

function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
    return {
        id: "01HZ-1",
        raceId: "r1",
        eventSeq: 0,
        eventType: "RACE_FINISHED",
        channel: "broadcast",
        payload: {},
        attempts: 0,
        enqueuedAt: "2026-05-09T00:00:00.000Z",
        nextAttemptAt: "2026-05-09T00:00:00.000Z",
        ...overrides,
    };
}

describe("RoutingDispatcher", () => {
    test("invokes the registered handler for the entry's channel", async () => {
        const calls: string[] = [];
        const d = new RoutingDispatcher({
            broadcast: async (e) => { calls.push(`bc:${e.id}`); },
            progression: async (e) => { calls.push(`pr:${e.id}`); },
        });
        await d.dispatch("broadcast", entry({ id: "a" }));
        await d.dispatch("progression", entry({ id: "b", channel: "progression" }));
        expect(calls).toEqual(["bc:a", "pr:b"]);
    });

    test("throws when no handler is registered for the channel", async () => {
        const d = new RoutingDispatcher({});
        await expect(
            d.dispatch("analytics", entry({ channel: "analytics" })),
        ).rejects.toThrow(/no handler/);
    });

    test("propagates handler errors to the caller (drainOnce will catch and retry)", async () => {
        const d = new RoutingDispatcher({
            broadcast: async () => { throw new Error("downstream timeout"); },
        });
        await expect(d.dispatch("broadcast", entry())).rejects.toThrow(
            /downstream timeout/,
        );
    });
});

describe("LoggingDispatcher", () => {
    test("emits structured JSON to the supplied sink", async () => {
        const lines: string[] = [];
        const d = new LoggingDispatcher("test", (line) => lines.push(line));
        await d.dispatch("broadcast", entry({ id: "x", eventSeq: 7 }));
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0]);
        expect(parsed.tag).toBe("test");
        expect(parsed.channel).toBe("broadcast");
        expect(parsed.outboxId).toBe("x");
        expect(parsed.eventSeq).toBe(7);
    });
});
