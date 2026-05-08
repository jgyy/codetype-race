import { describe, expect, test, beforeEach } from "bun:test";
import { advanceMatch } from "../../src/orchestration/advanceMatch";
import type { TournamentMatch } from "@codetype/shared/tournaments";
import type { MatchRepo } from "../../src/repos/MatchRepo";
import type { TournamentRepo } from "../../src/repos/TournamentRepo";

const TID = "11111111-1111-4111-8111-111111111111";

function mkMatch(over: Partial<TournamentMatch>): TournamentMatch {
    return {
        tournId: TID,
        round: 1,
        slot: 0,
        status: "live",
        players: ["a", "b"],
        winnerId: null,
        roomId: "r1",
        scheduledAt: "2026-05-09T12:00:00.000Z",
        completedAt: null,
        flagged: false,
        ...over,
    };
}

class FakeMatchRepo {
    store = new Map<string, TournamentMatch>();
    advanceCalls = 0;
    transitionCalls = 0;
    advanceShouldFail = false;

    private k(round: number, slot: number) {
        return `${round}#${slot}`;
    }
    set(m: TournamentMatch) {
        this.store.set(this.k(m.round, m.slot), { ...m });
    }
    async get(_t: string, round: number, slot: number) {
        return this.store.get(this.k(round, slot)) ?? null;
    }
    async transitionStatus(
        _t: string,
        round: number,
        slot: number,
        from: string,
        to: string,
        extra: Record<string, unknown> = {},
    ) {
        this.transitionCalls++;
        const m = this.store.get(this.k(round, slot));
        if (!m) return false;
        if (m.status !== from) return false;
        const next: TournamentMatch = { ...m, status: to as TournamentMatch["status"], ...extra };
        this.store.set(this.k(round, slot), next);
        return true;
    }
    async advanceWinner(args: {
        tournId: string;
        childRound: number;
        childSlot: number;
        winnerId: string;
        parentRound: number;
        parentSlot: number;
        parentSlotIndex: 0 | 1;
        completedAt: string;
    }) {
        this.advanceCalls++;
        if (this.advanceShouldFail) return false;
        const child = this.store.get(
            this.k(args.childRound, args.childSlot),
        );
        if (!child || child.status !== "live") return false;
        const parent = this.store.get(
            this.k(args.parentRound, args.parentSlot),
        );
        if (!parent) return false;
        const slot = args.parentSlotIndex;
        if (parent.players[slot] !== null) return false;
        const newPlayers: [string | null, string | null] = [...parent.players];
        newPlayers[slot] = args.winnerId;
        this.store.set(this.k(args.childRound, args.childSlot), {
            ...child,
            status: "done",
            winnerId: args.winnerId,
            completedAt: args.completedAt,
        });
        this.store.set(this.k(args.parentRound, args.parentSlot), {
            ...parent,
            players: newPlayers,
        });
        return true;
    }
}

class FakeTournamentRepo {
    transitions: Array<{ from: string; to: string; extra: Record<string, unknown> }> = [];
    async transitionStatus(
        _id: string,
        from: string,
        to: string,
        extra: Record<string, unknown> = {},
    ) {
        this.transitions.push({ from, to, extra });
        return true;
    }
}

describe("advanceMatch", () => {
    let m: FakeMatchRepo;
    let t: FakeTournamentRepo;
    beforeEach(() => {
        m = new FakeMatchRepo();
        t = new FakeTournamentRepo();
    });

    test("happy path — advances child to done and fills parent slot", async () => {
        m.set(mkMatch({ round: 1, slot: 0, status: "live" }));
        m.set(
            mkMatch({
                round: 0,
                slot: 0,
                status: "pending",
                players: [null, null],
            }),
        );
        const r = await advanceMatch({
            tournId: TID,
            round: 1,
            slot: 0,
            winnerId: "a",
            matches: m as unknown as MatchRepo,
            tournaments: t as unknown as TournamentRepo,
        });
        expect(r.advanced).toBe(true);
        expect(r.parent?.players[0]).toBe("a");
        expect((await m.get(TID, 1, 0))!.status).toBe("done");
    });

    test("double-finish race — second call is a no-op (CAS fails)", async () => {
        m.set(mkMatch({ round: 1, slot: 0, status: "live" }));
        m.set(
            mkMatch({
                round: 0,
                slot: 0,
                status: "pending",
                players: [null, null],
            }),
        );
        const first = await advanceMatch({
            tournId: TID,
            round: 1,
            slot: 0,
            winnerId: "a",
            matches: m as unknown as MatchRepo,
            tournaments: t as unknown as TournamentRepo,
        });
        const second = await advanceMatch({
            tournId: TID,
            round: 1,
            slot: 0,
            winnerId: "b",
            matches: m as unknown as MatchRepo,
            tournaments: t as unknown as TournamentRepo,
        });
        expect(first.advanced).toBe(true);
        expect(second.advanced).toBe(false);
        // Parent still has 'a', not 'b'.
        expect((await m.get(TID, 0, 0))!.players[0]).toBe("a");
    });

    test("round 0 final — flips tournament to finished exactly once", async () => {
        m.set(mkMatch({ round: 0, slot: 0, status: "live" }));
        const r = await advanceMatch({
            tournId: TID,
            round: 0,
            slot: 0,
            winnerId: "champ",
            matches: m as unknown as MatchRepo,
            tournaments: t as unknown as TournamentRepo,
        });
        expect(r.advanced).toBe(true);
        expect(r.finished).toBe(true);
        expect(t.transitions).toEqual([
            {
                from: "running",
                to: "finished",
                extra: { winnerId: "champ" },
            },
        ]);
    });

    test("missing match returns advanced=false", async () => {
        const r = await advanceMatch({
            tournId: TID,
            round: 1,
            slot: 0,
            winnerId: "x",
            matches: m as unknown as MatchRepo,
            tournaments: t as unknown as TournamentRepo,
        });
        expect(r.advanced).toBe(false);
    });
});
