import { describe, expect, test } from "bun:test";
import { DomainError } from "@codetype/domain";
import {
    CancelTournamentCommand,
    CancelTournamentHandler,
    CreateTournamentCommand,
    CreateTournamentHandler,
    RegisterForTournamentCommand,
    RegisterForTournamentHandler,
    SeedTournamentCommand,
    SeedTournamentHandler,
    WithdrawFromTournamentCommand,
    WithdrawFromTournamentHandler,
    type SeedingOrchestrator,
    type TournamentEntrant,
    type TournamentLite,
    type TournamentStatus,
    type TournamentsSink,
    type UserProfileLookup,
} from "../../src";
import { FakeClock, FakeRandom } from "../fakes";

class FakeTournaments implements TournamentsSink {
    rows = new Map<string, TournamentLite>();
    entrants = new Map<string, TournamentEntrant[]>();
    seed(t: TournamentLite) {
        this.rows.set(t.id, t);
        return this;
    }
    seedEntrants(id: string, ...e: TournamentEntrant[]) {
        this.entrants.set(id, e);
        return this;
    }
    async create(t: TournamentLite) {
        this.rows.set(t.id, t);
    }
    async get(id: string) {
        return this.rows.get(id) ?? null;
    }
    async transitionStatus(id: string, from: TournamentStatus, to: TournamentStatus) {
        const t = this.rows.get(id);
        if (!t || t.status !== from) return false;
        this.rows.set(id, { ...t, status: to });
        return true;
    }
    async addEntrant(e: TournamentEntrant) {
        const list = this.entrants.get(e.tournId) ?? [];
        list.push(e);
        this.entrants.set(e.tournId, list);
    }
    async removeEntrant(id: string, userId: string) {
        const list = (this.entrants.get(id) ?? []).filter((e) => e.userId !== userId);
        this.entrants.set(id, list);
    }
    async listEntrants(id: string) {
        return this.entrants.get(id) ?? [];
    }
}

class FakeUsers implements UserProfileLookup {
    map = new Map<string, { rating: number; display_name: string }>();
    seed(userId: string, rating: number, name: string) {
        this.map.set(userId, { rating, display_name: name });
        return this;
    }
    async getProfile(userId: string) {
        return this.map.get(userId) ?? null;
    }
}

const fakeSeeder: SeedingOrchestrator = {
    seed: async ({ tournId, size }) =>
        Array.from({ length: size }, (_, i) => ({ tournId, idx: i })),
};

function baseTournament(overrides: Partial<TournamentLite> = {}): TournamentLite {
    return {
        id: "t1",
        name: "T",
        size: 4,
        language: "ts",
        status: "registering",
        startsAt: "2026-12-01T00:00:00.000Z",
        registrationClosesAt: "2026-11-30T00:00:00.000Z",
        seasonId: null,
        hostId: "host",
        createdAt: "2026-05-08",
        winnerId: null,
        ...overrides,
    };
}

describe("CreateTournamentCommand", () => {
    test("rejects closesAt > startsAt", async () => {
        const tourn = new FakeTournaments();
        const random = new FakeRandom().queueUuid("11111111-1111-7111-8111-111111111111");
        await expect(
            new CreateTournamentHandler(tourn, random).execute(
                new CreateTournamentCommand({
                    hostId: "u1",
                    name: "T",
                    size: 4,
                    language: "ts",
                    startsAt: "2026-12-01",
                    registrationClosesAt: "2026-12-02",
                    seasonId: null,
                    nowIso: "x",
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("creates with random.uuid + status=registering", async () => {
        const tourn = new FakeTournaments();
        const random = new FakeRandom().queueUuid("22222222-2222-7222-8222-222222222222");
        const out = await new CreateTournamentHandler(tourn, random).execute(
            new CreateTournamentCommand({
                hostId: "u1",
                name: "T",
                size: 4,
                language: "ts",
                startsAt: "2026-12-01",
                registrationClosesAt: "2026-11-30",
                seasonId: null,
                nowIso: "iso",
            }),
        );
        expect(out.id).toBe("22222222-2222-7222-8222-222222222222");
        expect(tourn.rows.get(out.id)!.status).toBe("registering");
    });
});

describe("RegisterForTournamentCommand", () => {
    test("404 on missing", async () => {
        await expect(
            new RegisterForTournamentHandler(
                new FakeTournaments(),
                new FakeUsers(),
                new FakeClock(),
            ).execute(
                new RegisterForTournamentCommand({
                    userId: "u1",
                    tournId: "missing",
                    nowIso: "x",
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("409 when registration closed by clock", async () => {
        const tourn = new FakeTournaments().seed(baseTournament({
            registrationClosesAt: "2024-01-01T00:00:00.000Z",
        }));
        await expect(
            new RegisterForTournamentHandler(
                tourn,
                new FakeUsers(),
                new FakeClock(2_000_000_000_000),
            ).execute(
                new RegisterForTournamentCommand({
                    userId: "u1",
                    tournId: "t1",
                    nowIso: "x",
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("409 when full", async () => {
        const tourn = new FakeTournaments()
            .seed(baseTournament({ size: 1 }))
            .seedEntrants("t1", {
                tournId: "t1",
                userId: "old",
                displayName: "old",
                seedRank: null,
                snapshotRating: 1000,
                registeredAt: "x",
                eliminatedAt: null,
                dq: false,
            });
        await expect(
            new RegisterForTournamentHandler(
                tourn,
                new FakeUsers(),
                new FakeClock(0),
            ).execute(
                new RegisterForTournamentCommand({
                    userId: "u1",
                    tournId: "t1",
                    nowIso: "x",
                }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("falls back to STARTING_RATING when profile missing", async () => {
        const tourn = new FakeTournaments().seed(baseTournament());
        const handler = new RegisterForTournamentHandler(
            tourn,
            new FakeUsers(),
            new FakeClock(0),
        );
        const out = await handler.execute(
            new RegisterForTournamentCommand({
                userId: "u1",
                tournId: "t1",
                nowIso: "now",
            }),
        );
        expect(out.seedSnapshot).toBe(1000);
        expect((tourn.entrants.get("t1") ?? []).length).toBe(1);
    });

    test("uses profile rating when available", async () => {
        const tourn = new FakeTournaments().seed(baseTournament());
        const users = new FakeUsers().seed("u1", 1500, "alice");
        const out = await new RegisterForTournamentHandler(
            tourn,
            users,
            new FakeClock(0),
        ).execute(
            new RegisterForTournamentCommand({
                userId: "u1",
                tournId: "t1",
                nowIso: "now",
            }),
        );
        expect(out.seedSnapshot).toBe(1500);
        expect(tourn.entrants.get("t1")![0].displayName).toBe("alice");
    });
});

describe("SeedTournamentCommand", () => {
    test("404 missing", async () => {
        await expect(
            new SeedTournamentHandler(new FakeTournaments(), fakeSeeder).execute(
                new SeedTournamentCommand({ tournId: "missing" }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("rejects when not registering", async () => {
        const tourn = new FakeTournaments().seed(baseTournament({ status: "running" }));
        await expect(
            new SeedTournamentHandler(tourn, fakeSeeder).execute(
                new SeedTournamentCommand({ tournId: "t1" }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("happy path transitions registering→seeding→running and returns matches", async () => {
        const tourn = new FakeTournaments().seed(baseTournament({ size: 4 }));
        const out = await new SeedTournamentHandler(tourn, fakeSeeder).execute(
            new SeedTournamentCommand({ tournId: "t1" }),
        );
        expect(out.matches).toHaveLength(4);
        expect(tourn.rows.get("t1")!.status).toBe("running");
    });
});

describe("WithdrawFromTournamentCommand", () => {
    test("only allowed in registering", async () => {
        const tourn = new FakeTournaments().seed(baseTournament({ status: "running" }));
        await expect(
            new WithdrawFromTournamentHandler(tourn).execute(
                new WithdrawFromTournamentCommand({ userId: "u1", tournId: "t1" }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("removes entrant", async () => {
        const tourn = new FakeTournaments()
            .seed(baseTournament())
            .seedEntrants("t1", {
                tournId: "t1",
                userId: "u1",
                displayName: "u1",
                seedRank: null,
                snapshotRating: 1000,
                registeredAt: "x",
                eliminatedAt: null,
                dq: false,
            });
        await new WithdrawFromTournamentHandler(tourn).execute(
            new WithdrawFromTournamentCommand({ userId: "u1", tournId: "t1" }),
        );
        expect(tourn.entrants.get("t1")).toEqual([]);
    });
});

describe("CancelTournamentCommand", () => {
    test("rejects already-finished", async () => {
        const tourn = new FakeTournaments().seed(baseTournament({ status: "finished" }));
        await expect(
            new CancelTournamentHandler(tourn).execute(
                new CancelTournamentCommand({ tournId: "t1" }),
            ),
        ).rejects.toBeInstanceOf(DomainError);
    });

    test("transitions any non-terminal status to cancelled", async () => {
        const tourn = new FakeTournaments().seed(baseTournament({ status: "running" }));
        await new CancelTournamentHandler(tourn).execute(
            new CancelTournamentCommand({ tournId: "t1" }),
        );
        expect(tourn.rows.get("t1")!.status).toBe("cancelled");
    });
});
