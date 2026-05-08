import { describe, expect, test } from "bun:test";
import {
  applyDrainResults,
  enqueueInto,
  MAX_QUEUE,
  type PracticeRunEnvelope,
} from "../src/lib/offline/queue-core";

function env(id: string, t = 0): PracticeRunEnvelope {
  return {
    id,
    finishedAt: t,
    snippetId: "s1",
    language: "ts",
    netWpm: 60,
    grossWpm: 65,
    scaledWpm: 60,
    accuracy: 0.95,
    charsTyped: 100,
    errors: 5,
    durationMs: 30000,
  };
}

describe("enqueueInto", () => {
  test("appends new envelope", () => {
    const next = enqueueInto([env("a")], env("b"));
    expect(next.map((r) => r.id)).toEqual(["a", "b"]);
  });

  test("dedupes by id (later wins)", () => {
    const a1 = { ...env("a"), netWpm: 50 };
    const a2 = { ...env("a"), netWpm: 70 };
    const next = enqueueInto([a1], a2);
    expect(next).toHaveLength(1);
    expect(next[0].netWpm).toBe(70);
  });

  test("dedupe moves entry to end", () => {
    const next = enqueueInto([env("a"), env("b"), env("c")], env("a", 99));
    expect(next.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  test("evicts oldest when over cap", () => {
    const cap = 3;
    let q: PracticeRunEnvelope[] = [];
    for (const id of ["a", "b", "c", "d", "e"]) q = enqueueInto(q, env(id), cap);
    expect(q.map((r) => r.id)).toEqual(["c", "d", "e"]);
  });

  test("default cap is 100", () => {
    expect(MAX_QUEUE).toBe(100);
  });
});

describe("applyDrainResults", () => {
  test("partitions by per-id outcome", () => {
    const queue = [env("a"), env("b"), env("c")];
    const results = new Map<string, "ok" | "fail">([
      ["a", "ok"],
      ["b", "fail"],
      ["c", "ok"],
    ]);
    const r = applyDrainResults(queue, results);
    expect(r.drained.map((x) => x.id)).toEqual(["a", "c"]);
    expect(r.remaining.map((x) => x.id)).toEqual(["b"]);
  });

  test("missing outcomes default to remaining (safe)", () => {
    const queue = [env("a"), env("b")];
    const r = applyDrainResults(queue, new Map([["a", "ok"]]));
    expect(r.drained.map((x) => x.id)).toEqual(["a"]);
    expect(r.remaining.map((x) => x.id)).toEqual(["b"]);
  });
});
