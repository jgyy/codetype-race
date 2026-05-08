import type {
    Broadcaster,
    Clock,
    ConnectionRecord,
    ConnectionRepo,
    RecordFinishInput,
    Random,
    Room,
    RoomRepo,
    RoomSnapshot,
    SeedPlayer,
    SnippetFilters,
    SnippetMeta,
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

    async startCountdown(roomId: string, startedAt: number): Promise<void> {
        const snap = this.snapshots.get(roomId);
        if (!snap) throw new Error(`unknown room ${roomId}`);
        if (snap.status !== "lobby") {
            throw new Error("startCountdown: not lobby");
        }
        this.snapshots.set(roomId, {
            ...snap,
            status: "countdown",
            started_at: startedAt,
            version: snap.version + 1,
        });
    }

    public dnf: Array<{ roomId: string; displayName: string }> = [];
    async markPlayerDnf(roomId: string, displayName: string): Promise<void> {
        this.dnf.push({ roomId, displayName });
    }

    public finishes: RecordFinishInput[] = [];
    async recordFinish(input: RecordFinishInput): Promise<void> {
        this.finishes.push(input);
        // Mirror the legacy adapter side-effect: stamp finish on the
        // matching player row so subsequent listPlayers sees them as
        // finished. The InMemoryRoomRepo stores players by roomId.
        const players = this.players.get(input.roomId) ?? [];
        const idx = players.findIndex(
            (p) => p.display_name === input.displayName,
        );
        if (idx >= 0) {
            const merged = {
                ...players[idx],
                finished_at: input.finishedAt,
                gross_wpm: input.grossWpm,
                net_wpm: input.netWpm,
                accuracy: input.accuracy,
                scaled_wpm: input.scaledWpm,
                progress: 1,
            } as SeedPlayer & {
                finished_at?: number;
                scaled_wpm?: number;
                net_wpm?: number;
                gross_wpm?: number;
                accuracy?: number;
            };
            players[idx] = merged;
            this.players.set(input.roomId, players);
        }
    }
}

export class InMemoryConnectionRepo implements ConnectionRepo {
    public readonly rows = new Map<string, ConnectionRecord>();
    public chatTokensConsumed: Array<{ roomId: string; connectionId: string }> = [];
    public touched: Array<{ roomId: string; connectionId: string }> = [];

    async put(
        roomId: string,
        connectionId: string,
        displayName: string,
        role: "racer" | "spectator",
        opts: { cursor_lite?: boolean },
    ): Promise<void> {
        this.rows.set(connectionId, {
            connection_id: connectionId,
            display_name: displayName,
            role,
            cursor_lite: opts.cursor_lite,
            PK: `ROOM#${roomId}`,
            SK: `CONN#${connectionId}`,
        });
    }

    async byConnectionId(connectionId: string) {
        return this.rows.get(connectionId) ?? null;
    }

    async listByRoom(roomId: string): Promise<string[]> {
        const pk = `ROOM#${roomId}`;
        return [...this.rows.values()]
            .filter((r) => r.PK === pk)
            .map((r) => r.connection_id);
    }

    async delete(pk: string, sk: string): Promise<void> {
        for (const [id, row] of this.rows) {
            if (row.PK === pk && row.SK === sk) {
                this.rows.delete(id);
                return;
            }
        }
    }

    async touch(roomId: string, connectionId: string): Promise<void> {
        this.touched.push({ roomId, connectionId });
    }

    async consumeChatToken(
        roomId: string,
        connectionId: string,
    ): Promise<void> {
        this.chatTokensConsumed.push({ roomId, connectionId });
    }
}

export class FakeBroadcaster implements Broadcaster {
    public sent: Array<{ connectionId: string; payload: unknown }> = [];
    async postTo(connectionId: string, payload: unknown): Promise<boolean> {
        this.sent.push({ connectionId, payload });
        return true;
    }
}

export class InMemorySnippetRepo implements SnippetRepo {
    public readonly byId = new Map<string, SnippetMeta>();
    public pickQueue: SnippetRef[] = [];

    add(...ids: string[]) {
        for (const id of ids) {
            this.byId.set(id, { snippet_id: id, language: "ts", length: 100 });
        }
        return this;
    }

    addMeta(meta: SnippetMeta) {
        this.byId.set(meta.snippet_id, meta);
        return this;
    }

    queueRandom(...refs: SnippetRef[]) {
        this.pickQueue.push(...refs);
        return this;
    }

    async getById(id: string): Promise<SnippetRef | null> {
        const m = this.byId.get(id);
        return m ? { snippet_id: m.snippet_id } : null;
    }

    async getMetaById(id: string): Promise<SnippetMeta | null> {
        return this.byId.get(id) ?? null;
    }

    async random(_filters: SnippetFilters): Promise<SnippetRef | null> {
        return this.pickQueue.shift() ?? null;
    }
}
