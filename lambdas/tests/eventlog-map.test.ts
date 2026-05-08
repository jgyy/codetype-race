import { describe, expect, test } from "bun:test";
import type { DynamoDBRecord } from "aws-lambda";
import {
    recordToEnvelope,
    recordsToEnvelopes,
} from "../src/eventlog-map";
import { EventEnvelopeSchema } from "@codetype/shared/eventlog";

function rec(
    over: Partial<DynamoDBRecord["dynamodb"]> & {
        eventName?: DynamoDBRecord["eventName"];
    } = {},
): DynamoDBRecord {
    const { eventName = "INSERT", ...rest } = over;
    return { eventName, dynamodb: { ...rest } } as DynamoDBRecord;
}

describe("recordToEnvelope — RACE_FINISHED", () => {
    test("maps a USER#<u>/RACE#<ts>#<room> insert", () => {
        const env = recordToEnvelope(
            rec({
                Keys: {
                    PK: { S: "USER#u1" },
                    SK: { S: "RACE#1715170800#room42" },
                },
                NewImage: {
                    room_id: { S: "room42" },
                    finished_at: { N: "1715170800" },
                    display_name: { S: "alice" },
                    language: { S: "rust" },
                    scaled_wpm: { N: "85" },
                    accuracy: { N: "0.97" },
                },
            }),
        );
        expect(env).not.toBeNull();
        const parsed = EventEnvelopeSchema.parse(env);
        expect(parsed.type).toBe("RACE_FINISHED");
        expect(parsed.userId).toBe("u1");
        expect(parsed.payload.roomId).toBe("room42");
        expect(parsed.payload.language).toBe("rust");
        expect(parsed.payload.wpm).toBe(85);
        expect(parsed.payload.accuracy).toBeCloseTo(0.97);
    });

    test("envelope id is deterministic for same (user, room, ts)", () => {
        const r = rec({
            Keys: { PK: { S: "USER#u1" }, SK: { S: "RACE#1#r" } },
            NewImage: { room_id: { S: "r" }, finished_at: { N: "1" } },
        });
        const a = recordToEnvelope(r)!;
        const b = recordToEnvelope(r)!;
        expect(a.id).toBe(b.id);
    });

    test("ignores MODIFY events", () => {
        const env = recordToEnvelope(
            rec({
                eventName: "MODIFY",
                Keys: { PK: { S: "USER#u1" }, SK: { S: "RACE#1#r" } },
                NewImage: { room_id: { S: "r" }, finished_at: { N: "1" } },
            }),
        );
        expect(env).toBeNull();
    });

    test("returns null when room_id missing", () => {
        const env = recordToEnvelope(
            rec({
                Keys: { PK: { S: "USER#u1" }, SK: { S: "RACE#1#r" } },
                NewImage: { finished_at: { N: "1" } },
            }),
        );
        expect(env).toBeNull();
    });
});

describe("recordToEnvelope — DAILY_DONE", () => {
    test("maps a DAILY#<date>/USER#<u> insert", () => {
        const env = recordToEnvelope(
            rec({
                Keys: {
                    PK: { S: "DAILY#2026-05-08" },
                    SK: { S: "USER#u1" },
                },
                NewImage: { completed_at: { N: "1715170800" } },
            }),
        );
        expect(env).not.toBeNull();
        const parsed = EventEnvelopeSchema.parse(env);
        expect(parsed.type).toBe("DAILY_DONE");
        expect(parsed.payload.date).toBe("2026-05-08");
    });
});

describe("recordToEnvelope — TOURN_WON", () => {
    test("emits when winnerId transitions from absent to set", () => {
        const env = recordToEnvelope(
            rec({
                eventName: "MODIFY",
                Keys: {
                    PK: { S: "TOURN#t1" },
                    SK: { S: "MATCH#2#3" },
                },
                OldImage: {},
                NewImage: {
                    winnerId: { S: "u9" },
                    completedAt: { N: "1715170800" },
                },
            }),
        );
        expect(env).not.toBeNull();
        const parsed = EventEnvelopeSchema.parse(env);
        expect(parsed.type).toBe("TOURN_WON");
        expect(parsed.userId).toBe("u9");
        expect(parsed.payload.tournId).toBe("t1");
        expect(parsed.payload.round).toBe(2);
    });

    test("does not re-emit on a no-op modify with same winnerId", () => {
        const env = recordToEnvelope(
            rec({
                eventName: "MODIFY",
                Keys: { PK: { S: "TOURN#t1" }, SK: { S: "MATCH#2#3" } },
                OldImage: { winnerId: { S: "u9" } },
                NewImage: { winnerId: { S: "u9" } },
            }),
        );
        expect(env).toBeNull();
    });
});

describe("recordToEnvelope — irrelevant rows", () => {
    test("returns null for ROOM player rows (no userId on row)", () => {
        const env = recordToEnvelope(
            rec({
                Keys: { PK: { S: "ROOM#r" }, SK: { S: "PLAYER#alice" } },
                NewImage: { display_name: { S: "alice" } },
            }),
        );
        expect(env).toBeNull();
    });

    test("returns null for unknown PK/SK shapes", () => {
        const env = recordToEnvelope(
            rec({
                Keys: { PK: { S: "RANDOM#x" }, SK: { S: "Y#z" } },
                NewImage: {},
            }),
        );
        expect(env).toBeNull();
    });
});

describe("recordsToEnvelopes", () => {
    test("filters and preserves order", () => {
        const out = recordsToEnvelopes([
            rec({
                Keys: { PK: { S: "USER#u1" }, SK: { S: "RACE#1#r" } },
                NewImage: { room_id: { S: "r" }, finished_at: { N: "1" } },
            }),
            rec({
                Keys: { PK: { S: "RANDOM#x" }, SK: { S: "Y#z" } },
                NewImage: {},
            }),
            rec({
                Keys: { PK: { S: "DAILY#2026-05-08" }, SK: { S: "USER#u1" } },
                NewImage: { completed_at: { N: "2" } },
            }),
        ]);
        expect(out.map((e) => e.type)).toEqual([
            "RACE_FINISHED",
            "DAILY_DONE",
        ]);
    });
});
