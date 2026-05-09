import { describe, expect, test } from "bun:test";
import {
    formatRaceSeq,
    racePK,
    raceEventSK,
    raceCounterSK,
    raceProjectionSK,
    raceEventTypeGSI1PK,
    outboxPK,
    outboxSK,
    outboxDlqPK,
    idempotencyPK,
    idempotencySK,
} from "../src/ddb-keys";

describe("formatRaceSeq", () => {
    test("zero-pads to 10 digits", () => {
        expect(formatRaceSeq(0)).toBe("0000000000");
        expect(formatRaceSeq(7)).toBe("0000000007");
        expect(formatRaceSeq(1234567890)).toBe("1234567890");
    });
    test("rejects negatives and non-integers", () => {
        expect(() => formatRaceSeq(-1)).toThrow();
        expect(() => formatRaceSeq(1.5)).toThrow();
    });
    test("lex order matches numeric order", () => {
        const seqs = [0, 1, 9, 10, 99, 100, 999, 1000, 9999];
        const lex = seqs.map(formatRaceSeq).slice().sort();
        const num = seqs.slice().sort((a, b) => a - b).map(formatRaceSeq);
        expect(lex).toEqual(num);
    });
});

describe("race / outbox / idempotency keys", () => {
    test("racePK + raceEventSK", () => {
        expect(racePK("abc")).toBe("RACE#abc");
        expect(raceEventSK(42)).toBe("EV#0000000042");
    });
    test("raceCounterSK / raceProjectionSK", () => {
        expect(raceCounterSK()).toBe("COUNTER");
        expect(raceProjectionSK()).toBe("PROJ#STATE");
    });
    test("raceEventTypeGSI1PK", () => {
        expect(raceEventTypeGSI1PK("RACE_FINISHED")).toBe("EV#TYPE#RACE_FINISHED");
    });
    test("outbox keys", () => {
        expect(outboxPK()).toBe("OUTBOX");
        expect(outboxSK("01HZ")).toBe("01HZ");
        expect(outboxDlqPK()).toBe("OUTBOX_DLQ");
    });
    test("idempotency keys", () => {
        expect(idempotencyPK("u1")).toBe("IDEM#u1");
        expect(idempotencySK("cmd-1")).toBe("CMD#cmd-1");
    });
});
