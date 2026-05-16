/**
 * SuperMemo-2 (Wozniak, 1987). https://super-memory.com/english/ol/sm2.htm
 * Inputs are a prior state and a quality score q ∈ [0,5]; outputs the next state.
 * Chosen over FSRS for this codebase because SM-2 needs no per-user training data
 * and fits in 20 lines — appropriate scale for the B1 leaderboard MVP.
 */
export interface MasteryState {
  ease: number;
  intervalDays: number;
  repetitions: number;
}

const MIN_EASE = 1.3;

export function nextReview(prev: MasteryState, q: number): MasteryState & { nextReviewAt: Date } {
  const quality = Math.max(0, Math.min(5, Math.round(q)));
  let { ease, intervalDays, repetitions } = prev;

  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * ease);
  }

  ease = Math.max(MIN_EASE, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  const nextReviewAt = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);
  return { ease, intervalDays, repetitions, nextReviewAt };
}

export function accuracyToQuality(accuracy: number): number {
  // accuracy ∈ [0,1] → q ∈ [0,5]
  return Math.round(Math.max(0, Math.min(1, accuracy)) * 5);
}
