import type {
    Clock,
    Random,
    Room,
    RoomRepo,
    RoomSnapshot,
    SeedPlayer,
    SnippetFilters,
    SnippetRef,
    SnippetRepo,
} from "@codetype/domain";

export class FakeClock implements Clock {
    constructor(public epoch = 1_700_000_000_000) { }
    now() {
        return new Date(this.epoch);
    }
    epochMs() {
        return this.epoch;
    }
}

export class FakeRandom implements Random {
    private uuids: string[] = [];
    private codes: string[] = [];
    private floats: number[] = [];
    queueUuid(...v: string[]) {
        this.uuids.push(...v);
        return this;
    }
    queueCode(...v: string[]) {
        this.codes.push(...v);
        return this;
    }
    uuid() {
        return this.uuids.shift() ?? "00000000-0000-7000-8000-000000000000";
    }
    float() {
        return this.floats.shift() ?? 0;
    }
    joinCode() {
        return this.codes.shift() ?? "ABC123";
    }
}

export class InMemoryRoomRepo implements RoomRepo {
    public readonly snapshots = new Map<string, RoomSnapshot>();
    public readonly byCode = new Map<string, string>();
    public readonly players = new Map<string, SeedPlayer[]>();

    async save(room: Room, seedPlayers: SeedPlayer[]): Promise<void> {
        const snap = room.toSnapshot();
        if (this.byCode.has(snap.code)) {
            throw new Error(`code already taken: ${snap.code}`);
        }
        this.snapshots.set(snap.room_id, snap);
        this.byCode.set(snap.code, snap.room_id);
        this.players.set(snap.room_id, [...seedPlayers]);
    }

    async isCodeTaken(code: string): Promise<boolean> {
        return this.byCode.has(code);
    }

    async getById(roomId: string): Promise<RoomSnapshot | null> {
        return this.snapshots.get(roomId) ?? null;
    }

    async getByCode(code: string): Promise<RoomSnapshot | null> {
        const id = this.byCode.get(code);
        return id ? this.snapshots.get(id) ?? null : null;
    }

    async listPlayers(roomId: string): Promise<SeedPlayer[]> {
        return this.players.get(roomId) ?? [];
    }
}

export class InMemorySnippetRepo implements SnippetRepo {
    public readonly byId = new Map<string, SnippetRef>();
    public pickQueue: SnippetRef[] = [];

    add(...ids: string[]) {
        for (const id of ids) this.byId.set(id, { snippet_id: id });
        return this;
    }

    queueRandom(...refs: SnippetRef[]) {
        this.pickQueue.push(...refs);
        return this;
    }

    async getById(id: string): Promise<SnippetRef | null> {
        return this.byId.get(id) ?? null;
    }

    async random(_filters: SnippetFilters): Promise<SnippetRef | null> {
        return this.pickQueue.shift() ?? null;
    }
}
