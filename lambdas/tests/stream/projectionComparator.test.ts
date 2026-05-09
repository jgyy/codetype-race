import { describe, expect, test } from "bun:test";
import { compareRace } from "../../src/stream/projectionComparator";
import {
    initialRaceState,
    type RaceState,
} from "@codetype/domain/RaceReducer";
import type {
    RaceProjectionStore,
    RoomRepo,
} from "@codetype/domain/ports";
import type {
    Room,
    RoomSnapshot,
    SeedPlayer,
} from "@codetype/domain";

const RID = "11111111-1111-4111-8111-111111111111";

function projection(): RaceState {
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
        lastSeq: 7,
    };
}

class FakeProjectionStore implements RaceProjectionStore {
    constructor(public state: RaceState | null) { }
    async get() { return this.state; }
    async put() { return; }
}

class FakeRoomRepo implements RoomRepo {
    constructor(
        public snap: RoomSnapshot | null,
        public players: SeedPlayer[],
    ) { }
    async getById() { return this.snap; }
    async listPlayers() { return this.players; }
    // Unused methods — throw to surface accidental calls
    async save(): Promise<void> { throw new Error("unused"); }
    async isCodeTaken(): Promise<boolean> { throw new Error("unused"); }
    async getByCode(): Promise<RoomSnapshot | null> { throw new Error("unused"); }
    async startCountdown(): Promise<void> { throw new Error("unused"); }
    async markPlayerDnf(): Promise<void> { throw new Error("unused"); }
    async recordFinish(): Promise<void> { throw new Error("unused"); }
    async addPlayer(): Promise<void> { throw new Error("unused"); }
    async recordReplay(): Promise<void> { throw new Error("unused"); }
}

describe("compareRace orchestration", () => {
    test("fetches both sides and returns the comparator's report", async () => {
        const proj = projection();
        const snap: RoomSnapshot = {
            room_id: RID,
            code: "ABC123",
            host_id: "u1",
            snippet_id: "snip-1",
            status: "running",
            created_at: 1_700_000_000_000,
            version: 0,
        };
        const seed: SeedPlayer[] = [{
            user_id: "u1",
            display_name: "Alice",
            joined_at: 1_700_000_000_000,
            chars_typed: 50,
            errors: 1,
            progress: 0.5,
        }];
        const projStore = new FakeProjectionStore(proj);
        const roomRepo = new FakeRoomRepo(snap, seed);
        const r = await compareRace(RID, RID, { projectionStore: projStore, roomRepo });
        expect(r.divergent).toBe(false);
        expect(r.fields).toHaveLength(0);
    });

    test("snapshot present but projection missing -> oneSidedMissing='projection'", async () => {
        const snap: RoomSnapshot = {
            room_id: RID,
            code: "ABC123",
            host_id: "u1",
            snippet_id: "snip-1",
            status: "lobby",
            created_at: 1_700_000_000_000,
            version: 0,
        };
        const projStore = new FakeProjectionStore(null);
        const roomRepo = new FakeRoomRepo(snap, []);
        const r = await compareRace(RID, RID, { projectionStore: projStore, roomRepo });
        expect(r.divergent).toBe(true);
        expect(r.oneSidedMissing).toBe("projection");
    });

    test("flags charsTyped drift between stores", async () => {
        const proj = projection();
        const snap: RoomSnapshot = {
            room_id: RID,
            code: "ABC123",
            host_id: "u1",
            snippet_id: "snip-1",
            status: "running",
            created_at: 1_700_000_000_000,
            version: 0,
        };
        const seed: SeedPlayer[] = [{
            user_id: "u1",
            display_name: "Alice",
            joined_at: 1_700_000_000_000,
            chars_typed: 30,  // legacy says 30, projection says 50
            errors: 1,
            progress: 0.3,
        }];
        const projStore = new FakeProjectionStore(proj);
        const roomRepo = new FakeRoomRepo(snap, seed);
        const r = await compareRace(RID, RID, { projectionStore: projStore, roomRepo });
        expect(r.divergent).toBe(true);
        const f = r.fields.find((x) => x.path === "players[Alice].charsTyped");
        expect(f).toBeDefined();
        expect(f!.projection).toBe(50);
        expect(f!.snapshot).toBe(30);
    });
});
