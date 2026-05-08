import { describe, expect, test } from "bun:test";
import { shouldDeliverToPeer } from "../../ws/cursor";

describe("shouldDeliverToPeer (Phase 12 reduced cursor stream)", () => {
  test("non-lite peers receive every tick", () => {
    for (let t = 1; t <= 10; t++) {
      expect(shouldDeliverToPeer({ cursorLite: false, tick: t })).toBe(true);
    }
  });

  test("lite peers receive every other tick (5 Hz vs 10 Hz)", () => {
    const ticks = [1, 2, 3, 4, 5, 6, 7, 8];
    const delivered = ticks.filter((t) =>
      shouldDeliverToPeer({ cursorLite: true, tick: t }),
    );
    // Half rate, deterministic phase (even ticks).
    expect(delivered).toEqual([2, 4, 6, 8]);
  });

  test("over a 4-player room with one lite peer, message count halves for that peer only", () => {
    // Simulate 8 flush ticks with 4 peers (3 desktop, 1 mobile/lite).
    const peers = [
      { id: "p1", lite: false },
      { id: "p2", lite: false },
      { id: "p3", lite: false },
      { id: "p4", lite: true },
    ];
    const N_TICKS = 8;
    const counts = new Map<string, number>();
    for (let t = 1; t <= N_TICKS; t++) {
      for (const p of peers) {
        if (shouldDeliverToPeer({ cursorLite: p.lite, tick: t })) {
          counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
        }
      }
    }
    expect(counts.get("p1")).toBe(N_TICKS);
    expect(counts.get("p2")).toBe(N_TICKS);
    expect(counts.get("p3")).toBe(N_TICKS);
    expect(counts.get("p4")).toBe(N_TICKS / 2);
  });
});
