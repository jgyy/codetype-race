# ADR 0002: SM-2 for spaced repetition

- **Status:** Accepted
- **Date:** 2026-05-16
- **Deciders:** Architect (Claude Code), repo owner

## Context

codetype-race tracks per-user mastery of *topics* (e.g. `js-closures`,
`rust-borrowing`) and surfaces a "due for review" queue on `/profile`. The
`topic_mastery` table carries four columns — `ease`, `interval_days`,
`repetitions`, `next_review_at` — which already imply an SM-2-family algorithm,
but the choice was never written down. Reviewers will ask "why this and not
FSRS?", and the answer should live next to ADR 0001 rather than only in a
README paragraph.

Expected scale during the B1 Builders Programme is ≤ 1k attempts across the
whole cohort. There is no historical review-log corpus to train on.

The choice is between:

1. **SM-2** (SuperMemo-2, Wozniak 1987) — hand-tuned constants, no training.
2. **Anki-modified SM-2** — same shape, slightly different ease adjustment and
   a "learning steps" front-end.
3. **FSRS** (Free Spaced Repetition Scheduler, Ye 2022) — three-component
   memory model whose parameters are *learned* from review history.
4. **Custom heuristic** — e.g. raw `nextReviewAt = lastSeenAt + f(accuracy)`.

## Decision

We use **vanilla SM-2** as described in
[super-memory.com](https://super-memory.com/english/ol/sm2.htm). The
implementation lives in `src/lib/server/sm2.ts` (~20 lines) and is exercised by
`tests/sm2.test.ts`. Quality is derived from per-attempt typing accuracy via
`accuracyToQuality(accuracy) = round(clamp(accuracy, 0, 1) * 5)`.

## Rationale

### 1. No training data, no per-user fit

FSRS' accuracy advantage comes from *learning* the forgetting curve from the
user's own review log. With < 1k attempts spread across a cohort, every user
has ~tens of reviews — far below the dozens-to-hundreds FSRS needs to avoid
over-fit. SM-2's constants are pre-baked from Wozniak's empirical work and
require zero history to produce a sensible schedule on day 1.

### 2. Schema fit, ~20 lines of code

The four `topic_mastery` columns map 1:1 onto SM-2 state. FSRS would need a
separate `stability` / `difficulty` / `last_review` triple plus a parameter
vector per user, and either a WASM port of the FSRS optimiser or a periodic
out-of-band training job. That is disproportionate for a B1 submission.

### 3. WPM intentionally excluded from `quality`

Quality is derived from *accuracy only*. Speed is a learned consequence of
accuracy, and gating reviews on WPM would punish beginners and slow the queue
exactly when they most need spaced practice. This is a deliberate departure
from a "custom" scheme that would mix both.

### 4. Migration path is open

`topic_mastery` rows carry enough state (`ease`, `intervalDays`, `repetitions`,
`nextReviewAt`) that an FSRS migration can seed initial `stability` from
`intervalDays` without losing the user's queue. We are not locked in.

## Worked example

Initial state for a new (user, topic) pair: `ease = 2.5`, `intervalDays = 0`,
`repetitions = 0`.

User attempts a snippet for that topic with **accuracy = 0.92**, WPM = 48.

1. `quality = round(0.92 * 5) = 5`. (WPM is ignored.)
2. `quality ≥ 3`, so `repetitions = 0 + 1 = 1`. First successful rep → `intervalDays = 1`.
3. Ease update:
   `ease' = max(1.3, 2.5 + (0.1 − (5−5)·(0.08 + (5−5)·0.02))) = 2.6`.
4. `nextReviewAt = now + 1 day`.

Next day, user attempts again with **accuracy = 0.78** → `quality = 4`.

1. `quality ≥ 3`, so `repetitions = 2`. Second rep → `intervalDays = 6`.
2. `ease' = max(1.3, 2.6 + (0.1 − 1·(0.08 + 1·0.02))) = max(1.3, 2.6 + 0) = 2.6`.
3. `nextReviewAt = now + 6 days`.

Third successful review (`quality ≥ 3`) would set
`intervalDays = round(6 * 2.6) = 16`, and so on. A lapse (`quality < 3`)
resets `repetitions = 0`, `intervalDays = 1`, and *still* decreases ease toward
the floor of 1.3 — so chronically-failed topics resurface daily with
ever-shorter ease, which is the desired behaviour.

The exact formula is on line 29 of `src/lib/server/sm2.ts`:

```ts
ease = Math.max(MIN_EASE, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
```

## Consequences

- **Pro:** No training, no parameter store, no background job. Deterministic
  and trivially unit-testable.
- **Pro:** Same algorithm Anki users already understand → reviewers recognise it.
- **Con:** SM-2's interval growth is known to be slightly aggressive on hard
  cards versus FSRS. Acceptable at this scale.
- **Revisit if:** cohort logs exceed ~50k attempts, or users start complaining
  that the queue is mis-timing reviews. At that point FSRS becomes worth the
  extra moving parts.
