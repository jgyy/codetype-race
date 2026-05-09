import { describe, expect, test } from "bun:test";
import {
    applyEventBatch,
    ProjectionGapError,
} from "../../src/services/RaceProjectionHandler";
import { initialRaceState } from "../../src/services/RaceReducer";
import type { Tracer, Span } from "../../src/ports/Tracer";
import type { RaceEvent } from "../../src/events/RaceEvent";

interface RecordedSpan {
    name: string;
    attrs: Record<string, unknown>;
    status?: { code: "ok" | "error"; message?: string };
    exceptions: unknown[];
    ended: boolean;
}

function buildRecordingTracer(): {
    tracer: Tracer;
    spans: RecordedSpan[];
} {
    const spans: RecordedSpan[] = [];
    const make = (name: string): { rec: RecordedSpan; span: Span } => {
        const rec: RecordedSpan = {
            name,
            attrs: {},
            exceptions: [],
            ended: false,
        };
        spans.push(rec);
        return {
            rec,
            span: {
                setAttribute: (k, v) => {
                    rec.attrs[k] = v;
                },
                setStatus: (s) => {
                    rec.status = s;
                },
                recordException: (e) => {
                    rec.exceptions.push(e);
                },
                end: () => {
                    rec.ended = true;
                },
            },
        };
    };
    return {
        spans,
        tracer: {
            async startActiveSpan(name, fn) {
                const { span } = make(name);
                try {
                    return await fn(span);
                } finally {
                    span.end();
                }
            },
            startActiveSpanSync(name, fn) {
                const { span } = make(name);
                try {
                    return fn(span);
                } finally {
                    span.end();
                }
            },
        },
    };
}

function ev(seq: number, type: string = "RACE_CREATED"): RaceEvent {
    return {
        raceId: "r1",
        seq,
        type,
        actorId: "a",
        ts: "2026-05-09T00:00:00.000Z",
        commandId: "c",
        payload: {},
    } as unknown as RaceEvent;
}

describe("applyEventBatch tracing (Phase 15 / slice-7)", () => {
    test("no tracer: identical to untraced behaviour", () => {
        const result = applyEventBatch(initialRaceState(), [ev(0)]);
        expect(result.appliedSeqs).toEqual([0]);
    });

    test("tracer: emits domain.reduce span with eventCount + applied/skipped attrs", () => {
        const { tracer, spans } = buildRecordingTracer();
        applyEventBatch(initialRaceState(), [ev(0)], tracer);
        expect(spans).toHaveLength(1);
        expect(spans[0]!.name).toBe("domain.reduce");
        expect(spans[0]!.attrs).toMatchObject({
            eventCount: 1,
            appliedCount: 1,
            skippedCount: 0,
        });
        expect(spans[0]!.status).toEqual({ code: "ok" });
        expect(spans[0]!.ended).toBe(true);
    });

    test("tracer: records exception and rethrows on gap", () => {
        const { tracer, spans } = buildRecordingTracer();
        // Gap: lastSeq=0, but events start at seq=2 → ProjectionGapError.
        expect(() =>
            applyEventBatch(initialRaceState(), [ev(2)], tracer),
        ).toThrow(ProjectionGapError);
        expect(spans[0]!.status?.code).toBe("error");
        expect(spans[0]!.exceptions).toHaveLength(1);
        expect(spans[0]!.ended).toBe(true);
    });
});
