import { DomainError } from "../errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RoomId {
  private constructor(public readonly value: string) {}

  static from(value: string): RoomId {
    if (!UUID_RE.test(value)) {
      throw new DomainError("room.invalid_id", 400, `not a uuid: ${value}`);
    }
    return new RoomId(value);
  }
}
