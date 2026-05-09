import { describe, expect, test } from "bun:test";
import {
    initialRaceState,
    reduce,
    reduceAll,
    type RaceState,
} from "../../src/services/RaceReducer";
import type { RaceEvent, RaceEventType } from "../../src/events/RaceEvent";

const RID = "11111111-1111-4111-8111-111111111111";
const CORR = "22222222-2222-4222-8222-222222222222";

let SEQ = 0;
function ev(
    type: RaceEventType,
    actorId: string | null = null,
    payload: Record<string, unknown> = {},
    overrides: Partial<RaceEvent> = {},
): RaceEvent {
    return {
        raceId: RID,
        seq: SEQ++,
        type,
        occurredAt: new Date(1_700_000_000_000 + SEQ * 1000).toISOString(),
        actorId,
        payload,
        commandId: null,
        causationId: null,
        correlationId: CORR,
        ...overrides,
    };
}

function freshSeq() {
    SEQ = 0;
}

describe("reduce — per event type", () => {
    test("RACE_CREATED sets id + status=lobby", () => {
        freshSeq();
        const s = reduce(undefined, ev("RACE_CREATED"));
        expect(s.id).toBe(RID);
        expect(s.status).toBe("lobby");
        expect(s.lastSeq).toBe(0);
    });

    test("PLAYER_JOINED adds player; idempotent", () => {
        freshSeq();
        let s = reduce(undefined, ev("RACE_CREATED"));
        s = reduce(s, ev("PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" }));
        s = reduce(s, ev("PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" }));
        expect(Object.keys(s.players)).toEqual(["u1"]);
        expect(s.players.u1.displayName).toBe("A");
    });

    test("PLAYER_LEFT removes the player", () => {
        freshSeq();
        let s = reduce(undefined, ev("RACE_CREATED"));
        s = reduce(s, ev("PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" }));
        s = reduce(s, ev("PLAYER_LEFT", "u1"));
        expect(s.players.u1).toBeUndefined();
    });

    test("COUNTDOWN_STARTED → RACE_STARTED transitions status", () => {
        freshSeq();
        let s = reduce(undefined, ev("RACE_CREATED"));
        s = reduce(s, ev("COUNTDOWN_STARTED"));
        expect(s.status).toBe("countdown");
        expect(s.countdownStartedAt).not.toBeNull();
        s = reduce(s, ev("RACE_STARTED"));
        expect(s.status).toBe("racing");
        expect(s.startedAt).not.toBeNull();
    });

    test("CURSOR_PROGRESS updates only forward; ignores regressions", () => {
        freshSeq();
        let s = reduce(undefined, ev("RACE_CREATED"));
        s = reduce(s, ev("PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" }));
        s = reduce(s, ev("CURSOR_PROGRESS", "u1", {
            userId: "u1", charsTyped: 10, errors: 0, accuracy: 1,
        }));
        s = reduce(s, ev("CURSOR_PROGRESS", "u1", {
            userId: "u1", charsTyped: 25, errors: 1, accuracy: 0.96,
        }));
        // Out-of-order regression — should be ignored.
        s = reduce(s, ev("CURSOR_PROGRESS", "u1", {
            userId: "u1", charsTyped: 5, errors: 0, accuracy: 1,
        }));
        expect(s.players.u1.charsTyped).toBe(25);
        expect(s.players.u1.errors).toBe(1);
    });

    test("PLAYER_FINISHED freezes the player; later cursor progress is ignored", () => {
        freshSeq();
        let s = reduce(undefined, ev("RACE_CREATED"));
        s = reduce(s, ev("PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" }));
        s = reduce(s, ev("PLAYER_FINISHED", "u1", {
            finishedAt: new Date(1_700_000_999_000).toISOString(),
            charsTyped: 100, accuracy: 0.98, wpm: 75,
        }));
        const finishedAt = s.players.u1.finishedAt;
        expect(finishedAt).not.toBeNull();
        expect(s.players.u1.wpm).toBe(75);
        s = reduce(s, ev("CURSOR_PROGRESS", "u1", {
            userId: "u1", charsTyped: 200, errors: 0, accuracy: 1,
        }));
        expect(s.players.u1.charsTyped).toBe(100);
        expect(s.players.u1.finishedAt).toBe(finishedAt);
    });

    test("RACE_FINISHED / RACE_CANCELLED set terminal status", () => {
        freshSeq();
        let s = reduce(undefined, ev("RACE_CREATED"));
        s = reduce(s, ev("RACE_FINISHED"));
        expect(s.status).toBe("finished");
        expect(s.finishedAt).not.toBeNull();

        freshSeq();
        let t = reduce(undefined, ev("RACE_CREATED"));
        t = reduce(t, ev("RACE_CANCELLED"));
        expect(t.status).toBe("cancelled");
    });

    test("PLAYER_FLAGGED appends a reason to the player flag list", () => {
        freshSeq();
        let s = reduce(undefined, ev("RACE_CREATED"));
        s = reduce(s, ev("PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" }));
        s = reduce(s, ev("PLAYER_FLAGGED", "u1", { reason: "paste-shape" }));
        s = reduce(s, ev("PLAYER_FLAGGED", "u1", { reason: "wpm-spike" }));
        expect(s.players.u1.flags).toEqual(["paste-shape", "wpm-spike"]);
    });
});

describe("reduce — purity", () => {
    test("does not mutate input state", () => {
        freshSeq();
        const a = initialRaceState();
        const snapshot = JSON.stringify(a);
        reduce(a, ev("RACE_CREATED"));
        expect(JSON.stringify(a)).toBe(snapshot);
    });

    test("lastSeq is monotonic", () => {
        freshSeq();
        const a = ev("RACE_CREATED");
        const b: RaceEvent = { ...ev("PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" }), seq: 99 };
        const c: RaceEvent = { ...ev("PLAYER_JOINED", "u2", { userId: "u2", displayName: "B" }), seq: 50 };
        let s = reduce(undefined, a);
        s = reduce(s, b);
        s = reduce(s, c);
        expect(s.lastSeq).toBe(99);
    });
});

describe("reduce — commutativity property (non-overlapping per-player events)", () => {
    function shuffle<T>(arr: T[], rng: () => number): T[] {
        const out = arr.slice();
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }

    function buildRace(): { setup: RaceEvent[]; perPlayer: Map<string, RaceEvent[]>; teardown: RaceEvent[] } {
        freshSeq();
        const setup: RaceEvent[] = [
            ev("RACE_CREATED"),
            ev("PLAYER_JOINED", "u1", { userId: "u1", displayName: "A" }),
            ev("PLAYER_JOINED", "u2", { userId: "u2", displayName: "B" }),
            ev("COUNTDOWN_STARTED"),
            ev("RACE_STARTED"),
        ];
        const perPlayer = new Map<string, RaceEvent[]>();
        for (const u of ["u1", "u2"]) {
            const list: RaceEvent[] = [];
            let chars = 0;
            for (let i = 0; i < 20; i++) {
                chars += 5;
                list.push(ev("CURSOR_PROGRESS", u, {
                    userId: u, charsTyped: chars, errors: 0, accuracy: 1,
                }));
            }
            list.push(ev("PLAYER_FINISHED", u, {
                finishedAt: new Date(1_700_000_999_000 + (u === "u1" ? 0 : 1)).toISOString(),
                charsTyped: chars, accuracy: 1, wpm: 80,
            }));
            perPlayer.set(u, list);
        }
        const teardown = [ev("RACE_FINISHED")];
        return { setup, perPlayer, teardown };
    }

    function interleave(
        perPlayer: Map<string, RaceEvent[]>,
        rng: () => number,
    ): RaceEvent[] {
        // Preserve per-player order; arbitrarily interleave across players.
        const queues = new Map<string, RaceEvent[]>();
        for (const [k, v] of perPlayer) queues.set(k, v.slice());
        const out: RaceEvent[] = [];
        const keys = [...queues.keys()];
        while (queues.size > 0) {
            const k = keys[Math.floor(rng() * keys.length)];
            const q = queues.get(k);
            if (!q || q.length === 0) {
                queues.delete(k);
                keys.splice(keys.indexOf(k), 1);
                continue;
            }
            out.push(q.shift()!);
            if (q.length === 0) {
                queues.delete(k);
                keys.splice(keys.indexOf(k), 1);
            }
        }
        return out;
    }

    function mulberry32(a: number): () => number {
        return function () {
            let t = (a += 0x6D2B79F5);
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    test("1000 random orderings of non-overlapping player events converge to the same final state", () => {
        const { setup, perPlayer, teardown } = buildRace();
        // Re-seq every interleaving so reducer treats them as fresh monotonic events
        // (the property under test is on event *contents* commuting, not on seq).
        function reseq(events: RaceEvent[]): RaceEvent[] {
            return events.map((e, i) => ({ ...e, seq: i }));
        }
        const baseline = reduceAll(reseq([...setup, ...interleave(perPlayer, () => 0), ...teardown]));
        for (let i = 0; i < 1000; i++) {
            const rng = mulberry32(i + 1);
            const ordered = [...setup, ...interleave(perPlayer, rng), ...teardown];
            const result = reduceAll(reseq(ordered));
            const compare = (s: RaceState) => ({
                id: s.id,
                status: s.status,
                players: Object.fromEntries(
                    Object.entries(s.players).map(([k, p]) => [k, {
                        ...p,
                        flags: p.flags.slice(),
                    }]),
                ),
            });
            expect(compare(result)).toEqual(compare(baseline));
        }
    });
});
