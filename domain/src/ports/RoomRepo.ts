import type { Room, RoomSnapshot, SeedPlayer } from "../entities/Room";

export interface CheatFlag {
    code: string;
    severity: string;
    detail: string;
}

export interface RecordFinishInput {
    roomId: string;
    hostId: string;
    displayName: string;
    finishedAt: number;
    charsTyped: number;
    errors: number;
    grossWpm: number;
    netWpm: number;
    accuracy: number;
    scaledWpm: number;
    flagged?: boolean;
    flags?: CheatFlag[];
}

export interface RoomRepo {
    save(room: Room, seedPlayers: SeedPlayer[]): Promise<void>;

    isCodeTaken(code: string): Promise<boolean>;

    getById(roomId: string): Promise<RoomSnapshot | null>;

    getByCode(code: string): Promise<RoomSnapshot | null>;

    listPlayers(roomId: string): Promise<SeedPlayer[]>;

    startCountdown(roomId: string, startedAt: number): Promise<void>;

    markPlayerDnf(roomId: string, displayName: string): Promise<void>;

    recordFinish(input: RecordFinishInput): Promise<void>;

    /**
     * Add a player row to a room. Throws DomainError("player.display_name_taken")
     * on conflict (display_name unique per room).
     */
    addPlayer(roomId: string, player: SeedPlayer & { role?: "racer" | "spectator" }): Promise<void>;
}
