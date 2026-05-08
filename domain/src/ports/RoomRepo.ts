import type { Room, RoomSnapshot, SeedPlayer } from "../entities/Room";

/**
 * RoomRepo port — slice 13.3 surface.
 *
 * Only the methods CreateRoom + GetRoom need are exposed; the rest of
 * the room access pattern stays on the legacy lambdas/src/repos/RoomRepo
 * until later slices migrate the corresponding handlers.
 */
export interface RoomRepo {
  /** Persist a freshly-created Room with optional seed players. */
  save(room: Room, seedPlayers: SeedPlayer[]): Promise<void>;

  /** True if a room with this code already exists. */
  isCodeTaken(code: string): Promise<boolean>;

  /** Hydrate by id, or null if not found. */
  getById(roomId: string): Promise<RoomSnapshot | null>;

  /** Hydrate by join code, or null if not found. */
  getByCode(code: string): Promise<RoomSnapshot | null>;

  /** Players in a room (used for rematch seeding). */
  listPlayers(roomId: string): Promise<SeedPlayer[]>;
}
