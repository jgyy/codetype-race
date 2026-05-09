import { describe, expect, test } from "bun:test";
import { compareProjectionToSnapshot } from "../../src/services/ProjectionComparator";
import {
    initialRaceState,
    type RaceState,
} from "../../src/services/RaceReducer";
import type {
    RoomSnapshot,
    SeedPlayer,
} from "../../src/entities/Room";

const RID = "11111111-1111-4111-8111-111111111111";

function projection(overrides: Partial<RaceState> = {}): RaceState {
    return {
        ...initialRaceState(),
        id: RID,
        status: "racing",
        players: {
            u1: {
                userId: "u1",
                displayName: "Alice",
                charsTyped: 50,
                errors: 1,
                accuracy: 0.98,
                wpm: 60,
                finishedAt: null,
                flags: [],
            },
        },
        startedAt: "2026-05-09T00:00:00.000Z",
        lastSeq: 7,
        ...overrides,
    };
}

function snapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
    return {
        room_id: RID,
        code: "ABC123",
        host_id: "u1",
        snippet_id: "snip-1",
        status: "running",
        created_at: 1_700_000_000_000,
        version: 0,
        started_at: 1_700_000_000_000,
        ...overrides,
    };
}

function players(overrides: Partial<SeedPlayer> = {}): SeedPlayer[] {
    return [
        {
            user_id: "u1",
            display_name: "Alice",
            joined_at: 1_700_000_000_000,
            chars_typed: 50,
            errors: 1,
            progress: 0.5,
            ...overrides,
        },
    ];
}

describe("compareProjectionToSnapshot", () => {
    test("identical state -> no divergence", () => {
        const r = compareProjectionToSnapshot({
            raceId: RID,
            projection: projection(),
            snapshot: snapshot(),
            legacyPlayers: players(),
        });
        expect(r.divergent).toBe(false);
        expect(r.fields).toHaveLength(0);
        expect(r.oneSidedMissing).toBe("none");
    });

    test("status vocabulary is normalized: legacy 'running' == projection 'racing'", () => {
        const r = compareProjectionToSnapshot({
            raceId: RID,
            projection: projection({ status: "racing" }),
            snapshot: snapshot({ status: "running" }),
            legacyPlayers: players(),
        });
        expect(r.fields.find((f) => f.path === "status")).toBeUndefined();
    });

    test("status divergence: snapshot still 'lobby' but projection 'racing'", () => {
        const r = compareProjectionToSnapshot({
            raceId: RID,
            projection: projection({ status: "racing" }),
            snapshot: snapshot({ status: "lobby" }),
            legacyPlayers: players(),
        });
        expect(r.divergent).toBe(true);
        expect(r.fields.find((f) => f.path === "status")).toEqual({
            path: "status",
            projection: "racing",
            snapshot: "lobby",
        });
    });

    test("unknown legacy status is reported (not silently mapped)", () => {
        const r = compareProjectionToSnapshot({
            raceId: RID,
            projection: projection(),
            snapshot: snapshot({ status: "garbage" as any }),
            legacyPlayers: players(),
        });
        expect(r.fields.find((f) => f.path === "status")).toBeDefined();
    });

    test("player charsTyped divergence reported with full path", () => {
        const r = compareProjectionToSnapshot({
            raceId: RID,
            projection: projection(),
            snapshot: snapshot(),
            legacyPlayers: players({ chars_typed: 47 }),
        });
        expect(r.divergent).toBe(true);
        const f = r.fields.find((x) => x.path === "players[Alice].charsTyped");
        expect(f).toEqual({
            path: "players[Alice].charsTyped",
            projection: 50,
            snapshot: 47,
        });
    });

    test("player exists only on projection side", () => {
        const proj = projection();
        proj.players.u2 = {
            userId: "u2",
            displayName: "Bob",
            charsTyped: 10,
            errors: 0,
            accuracy: 1,
            wpm: 30,
            finishedAt: null,
            flags: [],
        };
        const r = compareProjectionToSnapshot({
            raceId: RID,
            projection: proj,
            snapshot: snapshot(),
            legacyPlayers: players(), // no Bob
        });
        expect(r.divergent).toBe(true);
        const f = r.fields.find((x) => x.path === "players[Bob]");
        expect(f?.snapshot).toBeNull();
    });

    test("player exists only on snapshot side", () => {
        const r = compareProjectionToSnapshot({
            raceId: RID,
            projection: projection(),
            snapshot: snapshot(),
            legacyPlayers: [
                ...players(),
                {
                    user_id: "u2",
                    display_name: "Bob",
                    joined_at: 0,
                    chars_typed: 0,
                    errors: 0,
                    progress: 0,
                },
            ],
        });
        const f = r.fields.find((x) => x.path === "players[Bob]");
        expect(f?.projection).toBeNull();
    });

    test("finished mismatch: projection has finishedAt but snapshot progress < 1", () => {
        const proj = projection();
        proj.players.u1.finishedAt = "2026-05-09T00:00:30.000Z";
        const r = compareProjectionToSnapshot({
            raceId: RID,
            projection: proj,
            snapshot: snapshot(),
            legacyPlayers: players({ progress: 0.5 }),
        });
        const f = r.fields.find((x) => x.path === "players[Alice].finished");
        expect(f).toEqual({
            path: "players[Alice].finished",
            projection: true,
            snapshot: false,
        });
    });

    test("oneSidedMissing: only projection present", () => {
        const r = compareProjectionToSnapshot({
            raceId: RID,
            projection: projection(),
            snapshot: null,
            legacyPlayers: [],
        });
        expect(r.divergent).toBe(true);
        expect(r.oneSidedMissing).toBe("snapshot");
    });

    test("oneSidedMissing: only snapshot present", () => {
        const r = compareProjectionToSnapshot({
            raceId: RID,
            projection: null,
            snapshot: snapshot(),
            legacyPlayers: players(),
        });
        expect(r.divergent).toBe(true);
        expect(r.oneSidedMissing).toBe("projection");
    });

    test("both missing -> no divergence (race never existed in either store)", () => {
        const r = compareProjectionToSnapshot({
            raceId: RID,
            projection: null,
            snapshot: null,
            legacyPlayers: [],
        });
        expect(r.divergent).toBe(false);
    });

    test("ignored fields (lastSeq, code, host_id, etc.) do not produce noise", () => {
        const r = compareProjectionToSnapshot({
            raceId: RID,
            projection: projection({ lastSeq: 999 }),
            snapshot: snapshot({ code: "DIFFERENT", host_id: "OTHER" }),
            legacyPlayers: players(),
        });
        expect(r.divergent).toBe(false);
        expect(r.fields).toHaveLength(0);
    });
});
