import { describe, expect, test } from "bun:test";
import { accuracy, grossWpm, netWpm, scaledWpm } from "../src/wpm";

describe("grossWpm", () => {
  test("zero chars returns 0", () => {
    expect(grossWpm(0, 60_000)).toBe(0);
  });

  test("60s @ 300 chars = 60 wpm", () => {
    expect(grossWpm(300, 60_000)).toBe(60);
  });

  test("sub-second elapsed scales up", () => {
    expect(grossWpm(5, 500)).toBe(120);
  });

  test("zero elapsed returns 0 (no NaN/Infinity)", () => {
    expect(grossWpm(100, 0)).toBe(0);
  });
});

describe("netWpm", () => {
  test("errors penalise speed", () => {
    expect(netWpm(300, 10, 60_000)).toBe(50);
  });

  test("floors at 0 when errors exceed words", () => {
    expect(netWpm(50, 100, 60_000)).toBe(0);
  });

  test("no errors equals gross", () => {
    expect(netWpm(300, 0, 60_000)).toBe(60);
  });
});

describe("accuracy", () => {
  test("zero chars returns 0", () => {
    expect(accuracy(0, 0)).toBe(0);
  });

  test("perfect typing is 1", () => {
    expect(accuracy(100, 0)).toBe(1);
  });

  test("clamps to 0 when errors exceed chars", () => {
    expect(accuracy(10, 999)).toBe(0);
  });

  test("partial accuracy", () => {
    expect(accuracy(100, 25)).toBe(0.75);
  });
});

describe("scaledWpm", () => {
  test("composite of net and accuracy", () => {
    // 300 chars, 10 errors, 60s -> netWpm=50, accuracy=290/300
    expect(scaledWpm(300, 10, 60_000)).toBeCloseTo(50 * (290 / 300));
  });
});
