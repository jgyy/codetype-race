import { reduce, type RaceState } from "./RaceReducer";
import type { Tracer } from "../ports/Tracer";
import type { RaceEvent } from "../events/RaceEvent";

export class ProjectionGapError extends Error {
    constructor(
        public readonly raceId: string,
        public readonly expectedSeq: number,
        public readonly receivedSeq: number,
    ) {
        super(
            `projection gap for race ${raceId}: expected seq ${expectedSeq}, got ${receivedSeq}`,
        );
        this.name = "ProjectionGapError";
    }
}

export interface ApplyBatchResult {
    state: RaceState;
    appliedSeqs: number[];
    skippedSeqs: number[];
}

export function applyEventBatch(
    prev: RaceState,
    events: readonly RaceEvent[],
    tracer?: Tracer,
): ApplyBatchResult {
    const work = (): ApplyBatchResult => {
        const sorted = [...events].sort((a, b) => a.seq - b.seq);
        const appliedSeqs: number[] = [];
        const skippedSeqs: number[] = [];
        let state = prev;

        for (const ev of sorted) {
            if (ev.seq <= state.lastSeq) {
                skippedSeqs.push(ev.seq);
                continue;
            }
            const expected = state.lastSeq + 1;
            if (ev.seq !== expected) {
                throw new ProjectionGapError(ev.raceId, expected, ev.seq);
            }
            state = reduce(state, ev);
            appliedSeqs.push(ev.seq);
        }

        return { state, appliedSeqs, skippedSeqs };
    };

    if (!tracer) return work();
    return tracer.startActiveSpanSync("domain.reduce", (span) => {
        span.setAttribute("eventCount", events.length);
        try {
            const result = work();
            span.setAttribute("appliedCount", result.appliedSeqs.length);
            span.setAttribute("skippedCount", result.skippedSeqs.length);
            span.setStatus({ code: "ok" });
            return result;
        } catch (err) {
            span.recordException(err);
            span.setStatus({
                code: "error",
                message: (err as { name?: string })?.name ?? "reduce.error",
            });
            throw err;
        }
    });
}
