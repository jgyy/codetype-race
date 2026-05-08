import { describe, expect, test } from "bun:test";
import { DomainError, JoinCode, Room } from "../../src";
import type { Clock, Random } from "../../src/ports";

class FakeClock implements Clock {
  constructor(private epoch = 1_700_000_000_000) {}
  now() {
    return new Date(this.epoch);
  }
  epochMs() {
    return this.epoch;
  }
  advance(ms: number) {
    this.epoch += ms;
  }
}

class FakeRandom implements Random {
  private uuids: string[] = [];
  private floats: number[] = [];
  private codes: string[] = [];
  setUuids(...v: string[]) {
    this.uuids = [...v];
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

describe("Room.create", () => {
  test("starts in lobby with version 0 and mode solo by default", () => {
    const clock = new FakeClock();
    const random = new FakeRandom().setUuids(
      "11111111-1111-7111-8111-111111111111",
    );
    const room = Room.create({
      hostId: "u1",
      snippetId: "s1",
      joinCode: JoinCode.from("ABC123"),
      clock,
      random,
    });
    const snap = room.toSnapshot();
    expect(snap.status).toBe("lobby");
    expect(snap.version).toBe(0);
    expect(snap.mode).toBeUndefined();
    expect(snap.host_id).toBe("u1");
    expect(snap.code).toBe("ABC123");
    expect(snap.created_at).toBe(clock.epochMs());
  });

  test("team mode is preserved on the snapshot", () => {
    const room = Room.create({
      hostId: "u1",
      snippetId: "s1",
      joinCode: JoinCode.from("ABC123"),
      mode: "team",
      clock: new FakeClock(),
      random: new FakeRandom().setUuids(
        "22222222-2222-7222-8222-222222222222",
      ),
    });
    expect(room.toSnapshot().mode).toBe("team");
    expect(room.mode).toBe("team");
  });
});

describe("Room.startCountdown", () => {
  function makeLobbyRoom() {
    return Room.create({
      hostId: "host",
      snippetId: "s1",
      joinCode: JoinCode.from("ABC123"),
      clock: new FakeClock(),
      random: new FakeRandom().setUuids(
        "33333333-3333-7333-8333-333333333333",
      ),
    });
  }

  test("only host may start", () => {
    const room = makeLobbyRoom();
    expect(() => room.startCountdown("intruder", new FakeClock())).toThrow(
      DomainError,
    );
  });

  test("rejects from non-lobby state", () => {
    const room = makeLobbyRoom();
    room.startCountdown("host", new FakeClock());
    expect(() => room.startCountdown("host", new FakeClock())).toThrow(
      DomainError,
    );
  });

  test("on success bumps version and stamps started_at", () => {
    const room = makeLobbyRoom();
    const clock = new FakeClock(2_000_000_000_000);
    room.startCountdown("host", clock);
    const snap = room.toSnapshot();
    expect(snap.status).toBe("countdown");
    expect(snap.version).toBe(1);
    expect(snap.started_at).toBe(2_000_000_000_000);
  });
});

describe("JoinCode validation", () => {
  test("accepts 6-char uppercase alphanumeric", () => {
    expect(JoinCode.from("ABC123").value).toBe("ABC123");
  });
  test("rejects lowercase", () => {
    expect(() => JoinCode.from("abc123")).toThrow(DomainError);
  });
  test("rejects wrong length", () => {
    expect(() => JoinCode.from("ABCDE")).toThrow(DomainError);
  });
});
