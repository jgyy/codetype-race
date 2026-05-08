import { describe, expect, test } from "bun:test";
import {
  initialAnnouncerState,
  reduceAnnouncer,
  MIN_GAP_MS,
} from "../src/lib/a11y/announcer";

describe("announcer reducer", () => {
  test("finished announces exactly once", () => {
    let s = initialAnnouncerState();
    s = reduceAnnouncer(s, { type: "finished", wpm: 67, accuracy: 0.94, now: 1000 });
    expect(s.message).toBe("You finished. 67 WPM, 94% accuracy.");
    expect(s.finishedAnnounced).toBe(true);
    const seqAfterFirst = s.seq;

    s = reduceAnnouncer(s, { type: "finished", wpm: 67, accuracy: 0.94, now: 5000 });
    expect(s.seq).toBe(seqAfterFirst); // no new emission
  });

  test("finished bypasses throttle", () => {
    let s = initialAnnouncerState();
    s = reduceAnnouncer(s, { type: "tick", charsLeft: 100, now: 0 });
    expect(s.message).toBe("100 characters left.");
    s = reduceAnnouncer(s, { type: "finished", wpm: 80, accuracy: 1, now: 500 });
    expect(s.message).toBe("You finished. 80 WPM, 100% accuracy.");
  });

  test("ticks within 3s are throttled", () => {
    let s = initialAnnouncerState();
    s = reduceAnnouncer(s, { type: "tick", charsLeft: 100, now: 0 });
    expect(s.message).toBe("100 characters left.");
    const seq1 = s.seq;
    s = reduceAnnouncer(s, { type: "tick", charsLeft: 90, now: 1500 });
    expect(s.seq).toBe(seq1);
    expect(s.message).toBe("100 characters left.");
  });

  test("ticks at 3s+ resume", () => {
    let s = initialAnnouncerState();
    s = reduceAnnouncer(s, { type: "tick", charsLeft: 100, now: 0 });
    s = reduceAnnouncer(s, { type: "tick", charsLeft: 50, now: MIN_GAP_MS });
    expect(s.message).toBe("50 characters left.");
  });

  test("overtook obeys throttle", () => {
    let s = initialAnnouncerState();
    s = reduceAnnouncer(s, { type: "overtook", passedName: "alice", now: 0 });
    expect(s.message).toBe("You passed alice.");
    const seq1 = s.seq;
    s = reduceAnnouncer(s, { type: "fell", passerName: "bob", now: 500 });
    expect(s.seq).toBe(seq1);
  });

  test("custom gap is honoured", () => {
    let s = initialAnnouncerState();
    s = reduceAnnouncer(s, { type: "tick", charsLeft: 10, now: 0 }, 1000);
    s = reduceAnnouncer(s, { type: "tick", charsLeft: 5, now: 999 }, 1000);
    expect(s.message).toBe("10 characters left.");
    s = reduceAnnouncer(s, { type: "tick", charsLeft: 3, now: 1000 }, 1000);
    expect(s.message).toBe("3 characters left.");
  });

  test("seq monotonic on each emission", () => {
    let s = initialAnnouncerState();
    const start = s.seq;
    s = reduceAnnouncer(s, { type: "tick", charsLeft: 1, now: 0 });
    expect(s.seq).toBe(start + 1);
    s = reduceAnnouncer(s, { type: "tick", charsLeft: 2, now: MIN_GAP_MS });
    expect(s.seq).toBe(start + 2);
  });
});
