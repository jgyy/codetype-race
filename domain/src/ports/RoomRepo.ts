import type { Room, RoomSnapshot, SeedPlayer } from "../entities/Room";

export interface RoomRepo {
    save(room: Room, seedPlayers: SeedPlayer[]): Promise<void>;

    isCodeTaken(code: string): Promise<boolean>;

    getById(roomId: string): Promise<RoomSnapshot | null>;

    getByCode(code: string): Promise<RoomSnapshot | null>;

    listPlayers(roomId: string): Promise<SeedPlayer[]>;

    startCountdown(roomId: string, startedAt: number): Promise<void>;

    markPlayerDnf(roomId: string, displayName: string): Promise<void>;
}
