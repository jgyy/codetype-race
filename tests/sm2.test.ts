import { describe, expect, it } from 'vitest';
import { accuracyToQuality, nextReview } from '../src/lib/server/sm2';

describe('SM-2 spaced repetition', () => {
  it('first successful rep returns 1-day interval', () => {
    const r = nextReview({ ease: 2.5, intervalDays: 0, repetitions: 0 }, 5);
    expect(r.intervalDays).toBe(1);
    expect(r.repetitions).toBe(1);
  });

  it('second successful rep returns 6-day interval', () => {
    const r = nextReview({ ease: 2.5, intervalDays: 1, repetitions: 1 }, 5);
    expect(r.intervalDays).toBe(6);
  });

  it('third rep multiplies by ease', () => {
    const r = nextReview({ ease: 2.5, intervalDays: 6, repetitions: 2 }, 5);
    expect(r.intervalDays).toBe(15); // round(6 * 2.5)
  });

  it('quality < 3 resets repetitions', () => {
    const r = nextReview({ ease: 2.5, intervalDays: 30, repetitions: 5 }, 2);
    expect(r.repetitions).toBe(0);
    expect(r.intervalDays).toBe(1);
  });

  it('ease never drops below 1.3', () => {
    let s = { ease: 2.5, intervalDays: 0, repetitions: 0 };
    for (let i = 0; i < 20; i++) s = nextReview(s, 0);
    expect(s.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('accuracyToQuality maps 0..1 → 0..5', () => {
    expect(accuracyToQuality(0)).toBe(0);
    expect(accuracyToQuality(1)).toBe(5);
    expect(accuracyToQuality(0.5)).toBe(3); // round(2.5)
  });
});
