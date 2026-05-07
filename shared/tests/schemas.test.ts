import { describe, expect, test } from "bun:test";
import {
  CreateRoomRequestSchema,
  CreateRoomResponseSchema,
  GetRoomResponseSchema,
  JoinRoomRequestSchema,
  JoinRoomResponseSchema,
  RoomCodeSchema,
  RoomStatusSchema,
  WsClientMsgSchema,
  WsConnectQuerySchema,
} from "../src/schemas";

describe("RoomCodeSchema", () => {
  test("accepts 6-char codes and uppercases them", () => {
    expect(RoomCodeSchema.parse("abcdef")).toBe("ABCDEF");
  });
  test("rejects wrong length", () => {
    expect(() => RoomCodeSchema.parse("abc")).toThrow();
  });
});

describe("RoomStatusSchema", () => {
  test("accepts known states", () => {
    for (const s of ["lobby", "countdown", "running", "finished"]) {
      expect(RoomStatusSchema.parse(s)).toBe(s);
    }
  });
  test("rejects unknown state", () => {
    expect(() => RoomStatusSchema.parse("racing")).toThrow();
  });
});

describe("HTTP request schemas", () => {
  test("CreateRoomRequest requires snippet_id", () => {
    expect(CreateRoomRequestSchema.parse({ snippet_id: "abc" })).toEqual({
      snippet_id: "abc",
    });
    expect(() => CreateRoomRequestSchema.parse({})).toThrow();
  });

  test("JoinRoomRequest validates display_name pattern", () => {
    const ok = JoinRoomRequestSchema.parse({
      code: "abcdef",
      display_name: "Alice_1",
    });
    expect(ok.code).toBe("ABCDEF");
    expect(ok.display_name).toBe("Alice_1");
    expect(() =>
      JoinRoomRequestSchema.parse({ code: "abcdef", display_name: "no!" }),
    ).toThrow();
  });
});

describe("HTTP response schemas round-trip", () => {
  test("CreateRoomResponse", () => {
    const v = { room_id: "r1", code: "ABCDEF" };
    expect(CreateRoomResponseSchema.parse(v)).toEqual(v);
  });
  test("JoinRoomResponse", () => {
    const v = { room_id: "r1", snippet_id: "s1", status: "lobby" as const };
    expect(JoinRoomResponseSchema.parse(v)).toEqual(v);
  });
  test("GetRoomResponse with optional started_at", () => {
    const v = {
      room_id: "r1",
      code: "ABCDEF",
      snippet_id: "s1",
      status: "running" as const,
      started_at: 1,
    };
    expect(GetRoomResponseSchema.parse(v)).toEqual(v);
  });
});

describe("WsClientMsgSchema discriminated union", () => {
  test("cursor", () => {
    const m = {
      action: "cursor" as const,
      progress: 0.5,
      chars_typed: 10,
      errors: 0,
    };
    expect(WsClientMsgSchema.parse(m)).toEqual(m);
  });
  test("ping/start/finish", () => {
    expect(WsClientMsgSchema.parse({ action: "ping" })).toEqual({
      action: "ping",
    });
    expect(WsClientMsgSchema.parse({ action: "start" })).toEqual({
      action: "start",
    });
    expect(
      WsClientMsgSchema.parse({
        action: "finish",
        chars_typed: 100,
        errors: 2,
      }),
    ).toEqual({ action: "finish", chars_typed: 100, errors: 2 });
  });
  test("rejects unknown action", () => {
    expect(() => WsClientMsgSchema.parse({ action: "wat" })).toThrow();
  });
  test("rejects negative errors", () => {
    expect(() =>
      WsClientMsgSchema.parse({ action: "finish", chars_typed: 1, errors: -1 }),
    ).toThrow();
  });
});

describe("WsConnectQuerySchema", () => {
  test("uppercases code and strips whitespace", () => {
    const v = WsConnectQuerySchema.parse({
      code: "abcdef",
      display_name: "  Alice  ",
    });
    expect(v.code).toBe("ABCDEF");
    expect(v.display_name).toBe("Alice");
  });
});
