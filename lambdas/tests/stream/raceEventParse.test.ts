import { describe, expect, test } from "bun:test";
import type { DynamoDBRecord } from "aws-lambda";
import {
    groupByRace,
    recordToRaceEvent,
    recordsToRaceEvents,
} from "../../src/stream/raceEventParse";

const RID = "11111111-1111-4111-8111-111111111111";
const CORR = "22222222-2222-4222-8222-222222222222";

function eventRecord(opts: {
    seq: number;
    type?: string;
    actorId?: string | null;
    payload?: Record<string, unknown>;
    eventName?: "INSERT" | "MODIFY" | "REMOVE";
}): DynamoDBRecord {
    const { seq, type = "RACE_CREATED", actorId = null, payload = {}, eventName = "INSERT" } = opts;
    const sk = `EV#${String(seq).padStart(10, "0")}`;
    const payloadM: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
        if (typeof v === "string") payloadM[k] = { S: v };
        else if (typeof v === "number") payloadM[k] = { N: String(v) };
        else if (typeof v === "boolean") payloadM[k] = { BOOL: v };
        else if (v === null) payloadM[k] = { NULL: true };
    }
    return {
        eventName,
        dynamodb: {
            Keys: { PK: { S: `RACE#${RID}` }, SK: { S: sk } },
            NewImage: {
                PK: { S: `RACE#${RID}` },
                SK: { S: sk },
                raceId: { S: RID },
                seq: { N: String(seq) },
                type: { S: type },
                occurredAt: { S: "2026-05-09T00:00:00.000Z" },
                actorId: actorId == null ? { NULL: true } : { S: actorId },
                payload: { M: payloadM },
                commandId: { NULL: true },
                causationId: { NULL: true },
                correlationId: { S: CORR },
            },
        },
    } as DynamoDBRecord;
}

describe("recordToRaceEvent", () => {
    test("hydrates event from INSERT under RACE# / EV#", () => {
        const r = recordToRaceEvent(
            eventRecord({
                seq: 3,
                type: "PLAYER_JOINED",
                actorId: "u1",
                payload: { userId: "u1", displayName: "A" },
            }),
        );
        expect(r).not.toBeNull();
        expect(r!.raceId).toBe(RID);
        expect(r!.seq).toBe(3);
        expect(r!.type).toBe("PLAYER_JOINED");
        expect(r!.actorId).toBe("u1");
        expect(r!.payload).toEqual({ userId: "u1", displayName: "A" });
    });

    test("returns null for MODIFY / REMOVE", () => {
        expect(
            recordToRaceEvent(eventRecord({ seq: 0, eventName: "MODIFY" })),
        ).toBeNull();
        expect(
            recordToRaceEvent(eventRecord({ seq: 0, eventName: "REMOVE" })),
        ).toBeNull();
    });

    test("returns null for non-RACE# partitions", () => {
        const rec: DynamoDBRecord = {
            eventName: "INSERT",
            dynamodb: {
                Keys: { PK: { S: "USER#abc" }, SK: { S: "PROFILE" } },
                NewImage: {
                    PK: { S: "USER#abc" },
                    SK: { S: "PROFILE" },
                },
            },
        } as DynamoDBRecord;
        expect(recordToRaceEvent(rec)).toBeNull();
    });

    test("returns null for non-event SK (counter, projection)", () => {
        const counter: DynamoDBRecord = {
            eventName: "INSERT",
            dynamodb: {
                Keys: { PK: { S: `RACE#${RID}` }, SK: { S: "COUNTER" } },
                NewImage: {
                    PK: { S: `RACE#${RID}` },
                    SK: { S: "COUNTER" },
                    nextSeq: { N: "1" },
                },
            },
        } as DynamoDBRecord;
        expect(recordToRaceEvent(counter)).toBeNull();
    });

    test("returns null for unknown event types", () => {
        expect(
            recordToRaceEvent(eventRecord({ seq: 0, type: "UNKNOWN_TYPE" })),
        ).toBeNull();
    });

    test("treats NULL actorId / commandId / causationId as null", () => {
        const r = recordToRaceEvent(eventRecord({ seq: 0, actorId: null }));
        expect(r!.actorId).toBeNull();
        expect(r!.commandId).toBeNull();
        expect(r!.causationId).toBeNull();
    });

    test("recordsToRaceEvents skips non-events", () => {
        const counter: DynamoDBRecord = {
            eventName: "INSERT",
            dynamodb: {
                Keys: { PK: { S: `RACE#${RID}` }, SK: { S: "COUNTER" } },
                NewImage: {
                    PK: { S: `RACE#${RID}` },
                    SK: { S: "COUNTER" },
                    nextSeq: { N: "1" },
                },
            },
        } as DynamoDBRecord;
        const events = recordsToRaceEvents([
            eventRecord({ seq: 0 }),
            counter,
            eventRecord({ seq: 1, type: "PLAYER_JOINED", actorId: "u1" }),
        ]);
        expect(events.map((e) => e.seq)).toEqual([0, 1]);
    });
});

describe("groupByRace", () => {
    test("partitions events by raceId, preserving relative order", () => {
        const e1 = recordToRaceEvent(eventRecord({ seq: 0 }))!;
        const e2 = recordToRaceEvent(eventRecord({ seq: 1, type: "PLAYER_JOINED", actorId: "u1" }))!;
        const e3 = { ...e1, raceId: "race-2", seq: 0 };
        const grouped = groupByRace([e1, e3, e2]);
        expect(grouped.get(RID)!.map((e) => e.seq)).toEqual([0, 1]);
        expect(grouped.get("race-2")!.map((e) => e.seq)).toEqual([0]);
    });
});
