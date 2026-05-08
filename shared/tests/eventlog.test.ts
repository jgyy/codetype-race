import { describe, expect, test } from "bun:test";
import {
    EventEnvelopeSchema,
    RaceFinishedPayloadSchema,
} from "../src/eventlog";

const validEnvelope = {
    id: "11111111-1111-4111-8111-111111111111",
    type: "RACE_FINISHED" as const,
    occurredAt: "2026-05-08T12:00:00.000Z",
    userId: "u1",
    payload: { roomId: "r1", displayName: "alice", finishedAt: 1715170800 },
    source: "stream" as const,
};

describe("EventEnvelope", () => {
    test("accepts a well-formed envelope and defaults v=1", () => {
        const parsed = EventEnvelopeSchema.parse(validEnvelope);
        expect(parsed.v).toBe(1);
        expect(parsed.type).toBe("RACE_FINISHED");
    });

    test("rejects bad uuid", () => {
        expect(() =>
            EventEnvelopeSchema.parse({ ...validEnvelope, id: "not-a-uuid" }),
        ).toThrow();
    });

    test("rejects unknown type", () => {
        expect(() =>
            EventEnvelopeSchema.parse({ ...validEnvelope, type: "WAT" }),
        ).toThrow();
    });

    test("rejects empty userId", () => {
        expect(() =>
            EventEnvelopeSchema.parse({ ...validEnvelope, userId: "" }),
        ).toThrow();
    });

    test("rejects non-datetime occurredAt", () => {
        expect(() =>
            EventEnvelopeSchema.parse({
                ...validEnvelope,
                occurredAt: "yesterday",
            }),
        ).toThrow();
    });
});

describe("RaceFinishedPayload", () => {
    test("accepts minimal payload", () => {
        const p = RaceFinishedPayloadSchema.parse({
            roomId: "r1",
            displayName: "alice",
            finishedAt: 1,
        });
        expect(p.roomId).toBe("r1");
    });

    test("rejects accuracy > 1", () => {
        expect(() =>
            RaceFinishedPayloadSchema.parse({
                roomId: "r1",
                displayName: "alice",
                finishedAt: 1,
                accuracy: 1.5,
            }),
        ).toThrow();
    });
});
