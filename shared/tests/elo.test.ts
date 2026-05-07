import { describe, expect, test } from "bun:test";
import {
  computeRatingDeltas,
  expectedScore,
  type RaceParticipant,
} from "../src/elo";

describe("expectedScore", () => {
  test("equal ratings → 0.5", () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5);
  });
  test("higher rating wins on average", () => {
    expect(expectedScore(1600, 1400)).toBeGreaterThan(0.5);
    expect(expectedScore(1400, 1600)).toBeLessThan(0.5);
  });
  test("400-point gap ≈ 91% expected", () => {
    expect(expectedScore(1800, 1400)).toBeCloseTo(0.909, 2);
  });
});

describe("computeRatingDeltas — 2 players", () => {
  test("equal ratings, lower-seed wins → +16 / -16 at K=32", () => {
    const ps: RaceParticipant[] = [
      { userId: "a", rating: 1500, finishOrder: 1 },
      { userId: "b", rating: 1500, finishOrder: 2 },
    ];
    const d = computeRatingDeltas(ps);
    expect(d["a"]).toBe(16);
    expect(d["b"]).toBe(-16);
  });
  test("upset: lower-rated beats higher gives bigger swing", () => {
    const ps: RaceParticipant[] = [
      { userId: "low", rating: 1200, finishOrder: 1 },
      { userId: "high", rating: 1800, finishOrder: 2 },
    ];
    const d = computeRatingDeltas(ps);
    expect(d["low"]).toBeGreaterThan(20);
    expect(d["high"]).toBeLessThan(-20);
  });
  test("tie → ~0", () => {
    const ps: RaceParticipant[] = [
      { userId: "a", rating: 1500, finishOrder: 1 },
      { userId: "b", rating: 1500, finishOrder: 1 },
    ];
    const d = computeRatingDeltas(ps);
    expect(d["a"]).toBe(0);
    expect(d["b"]).toBe(0);
  });
});

describe("computeRatingDeltas — 4 players", () => {
  test("ordering totals to ~zero", () => {
    const ps: RaceParticipant[] = [
      { userId: "a", rating: 1500, finishOrder: 1 },
      { userId: "b", rating: 1500, finishOrder: 2 },
      { userId: "c", rating: 1500, finishOrder: 3 },
      { userId: "d", rating: 1500, finishOrder: 4 },
    ];
    const d = computeRatingDeltas(ps);
    const sum = Object.values(d).reduce((s, v) => s + v, 0);
    expect(Math.abs(sum)).toBeLessThanOrEqual(2); // rounding tolerance
    expect(d["a"]).toBeGreaterThan(0);
    expect(d["d"]).toBeLessThan(0);
  });
});

describe("computeRatingDeltas — degenerate", () => {
  test("single participant → 0", () => {
    expect(
      computeRatingDeltas([{ userId: "x", rating: 1000, finishOrder: 1 }]),
    ).toEqual({ x: 0 });
  });
  test("empty → {}", () => {
    expect(computeRatingDeltas([])).toEqual({});
  });
});
