# Phase 07 — Power Features

Bundles **B5 Replay**, **B9 Community snippet uploads**, **B10 Anti-cheat**.

---

## B5 — Replay system

### Storage decision

**S3, not DynamoDB.** Replays are append-only, read rarely after race ends, can exceed DDB's 400KB item limit, and cost ~10× less to store at scale.

### Data flow

1. During race, client buffers cursor samples in memory: `Array<{ t: number; pos: number }>` per racer.
2. Client also receives others' samples via WS; merges into its own buffer.
3. On `finished`, **last surviving racer's client** uploads `Replay.json` to S3:
   - Bucket: `${stack}-replays`, key: `replays/<roomId>.json`.
   - PUT via presigned URL from `lambdas/http/getReplayUploadUrl.ts`.
4. `RoomRepo.recordReplay(roomId, s3Key)` writes the key onto the room item.
5. `RoomRepo` `setStatus('finished')` commits.

Alternative: server-side reconstruction in `stream/broadcast.ts` is feasible but doubles broadcast cost. Skip for v1.

### Replay format (`@codetype/shared/schemas`)

```ts
export const ReplaySchema = z.object({
  version: z.literal(1),
  roomId: z.string(),
  snippetId: z.string(),
  startedAt: z.number(),
  durationMs: z.number(),
  participants: z.array(z.object({
    userId: z.string(),
    displayName: z.string(),
    samples: z.array(z.tuple([z.number(), z.number()])),  // [t, pos]
  })),
});
```

### Backend

- `lambdas/http/getReplayUploadUrl.ts`: returns `{ url, fields }` from S3 presigned POST. Validates the caller participated in the room.
- `lambdas/http/getReplay.ts`: returns redirect to a presigned GET URL.
- S3 bucket: lifecycle rule deletes replays after 90 days.

### Frontend

- `web/src/app/replay/[roomId]/page.tsx`:
  - Fetches `Replay.json`.
  - `<ReplayPlayer />` renders snippet with overlaid cursor positions per racer.
  - Controls: play/pause, scrubber, 0.5×/1×/2× speed.
  - Driven by `requestAnimationFrame` reading from sorted samples.
- `Podium.tsx`: "Watch replay" button if `room.replayKey` exists.

### Acceptance

- [ ] Replay uploads on finish; ≤500KB typical (samples downsampled to 10Hz pre-upload).
- [ ] Replay viewer accurately reproduces relative finishing order.
- [ ] Scrubber seeks without jank up to 8 racers.
- [ ] Old replays (>90 days) gracefully 404 via lifecycle.

### Test plan

- `web/src/app/replay/.../ReplayPlayer.test.tsx` — synthetic `Replay.json` fixtures; assert positions at t=0, t=midpoint, t=end.
- Manual: deliberately drop a racer mid-race; ensure replay shows their last position.

### Risks

- **Risk:** Last racer's browser closes before upload.
  - **Mitigation:** all clients race to upload; first successful PUT wins (S3 conditional `If-None-Match: *`).
- **Risk:** Replay payload bloats with high-Hz cursor sampling.
  - **Mitigation:** downsample to ≤10 samples/sec pre-upload (drop adjacent samples with same `pos`).

---

## B9 — Community snippet uploads

### Roles

Cognito user pool group `admin`. Group claim surfaces in JWT as `cognito:groups`.

### Schema

```ts
export const SnippetSubmissionSchema = z.object({
  language: z.string(),
  difficulty: z.number().int().min(1).max(5),
  title: z.string().min(3).max(80),
  text: z.string().min(20).max(2000),
  source: z.string().url().optional(),  // attribution
});
```

### Data model

Snippet item gains `status: 'pending' | 'approved' | 'rejected'`, `submittedBy`, `reviewedBy?`, `reviewedAt?`. Pending snippets indexed under `STATUS#PENDING` for the moderation queue.

### Backend

- `POST /snippets` (auth): writes pending snippet. Rate limit 5/day/user.
- `GET /admin/snippets/pending` (admin only): lists pending.
- `POST /admin/snippets/:id/approve` and `/reject` (admin only).
- Middleware extension: `withHttp` accepts an `auth: 'optional' | 'required' | 'admin'` flag; checks `cognito:groups` for `admin`.

### Frontend

- `web/src/app/snippets/submit/page.tsx` — form with live preview, language autocomplete, difficulty slider, character counter.
- `web/src/app/admin/snippets/page.tsx` — pending list, approve/reject buttons. Hidden from non-admins via `Nav.tsx` conditional.

### Acceptance

- [ ] Non-admin users get 403 from admin endpoints.
- [ ] Approved snippets appear in random pool immediately (no caching layer).
- [ ] Rejection writes a reason; submitter can see it on their submissions page.

### Test plan

- `lambdas/tests/handlers/submitSnippet.test.ts` — rate limit, validation.
- `lambdas/tests/middleware.auth.test.ts` — admin claim required.

---

## B10 — Anti-cheat heuristics

### Philosophy

**Flag, never auto-ban.** False positives are inevitable; treat flags as a soft signal — exclude flagged runs from leaderboards, allow user to see and dispute.

### Heuristics (`@codetype/shared/anticheat.ts`, pure)

```ts
export interface RunSamples {
  startedAt: number;
  finishedAt: number;
  keystrokes: Array<{ t: number; char: string }>;
  snippetText: string;
}

export interface CheatSignal { code: string; severity: 'low' | 'medium' | 'high'; detail: string; }

export function evaluateRun(run: RunSamples): CheatSignal[] {
  const signals: CheatSignal[] = [];
  // 1. Implausible WPM
  if (wpm > 250) signals.push({ code: 'WPM_TOO_HIGH', severity: 'high', detail: `${wpm}` });
  // 2. Implausibly short duration vs snippet length
  if (durMs / run.snippetText.length < 25) signals.push({ code: 'SUB_HUMAN_INTERVAL', severity: 'high', detail: '...' });
  // 3. Low keystroke variance (bot signature)
  const stddev = stddevOfIntervals(run.keystrokes);
  if (stddev < 8 && run.keystrokes.length > 50) signals.push({ code: 'LOW_VARIANCE', severity: 'medium', detail: `${stddev}ms` });
  // 4. Paste detection: large advance in single sample
  if (maxIntervalAdvance > 5) signals.push({ code: 'PASTE_SUSPECTED', severity: 'high', detail: '...' });
  return signals;
}
```

### Backend integration

- `ws/finish.ts` and `POST /daily/submit` call `evaluateRun(...)`.
- If any `high` severity signal, run is stored with `flagged: true`, `flags: CheatSignal[]`.
- Flagged runs:
  - Excluded from leaderboards (filter on read).
  - Excluded from rating updates.
  - Visible in user's history with a "🚩 flagged" badge and explanation.

### Configuration

Thresholds via env vars (`ANTICHEAT_MAX_WPM=250` etc.) so they can be tuned without redeploys. Document in `infra/`.

### Frontend

- Flagged badges with tooltip explaining the signal.
- "Dispute" button stub (logs to CloudWatch for now; real workflow is post-MVP).

### Acceptance

- [ ] Pure functions in `@codetype/shared/anticheat`, fully unit-tested.
- [ ] Synthetic bot run (constant interval, WPM 300) triggers `LOW_VARIANCE` + `WPM_TOO_HIGH`.
- [ ] Genuine fast typist run (200 WPM, natural variance) does NOT flag.
- [ ] Flagged runs excluded from leaderboard query results (via filter expression).

### Test plan

- `shared/tests/anticheat.test.ts` — fixtures: bot, fast-human, slow-human, paste, normal. Each asserts exact flag set.
- Integration test: end-to-end finish flow with synthetic bot data → flagged run, no rating change.

### Risks

- **Risk:** Tuning thresholds incorrectly produces noisy flags.
  - **Mitigation:** start permissive (only `high` severity flags act); ship a CloudWatch metric for flag rate; iterate.
- **Risk:** Smart cheaters mimic human variance.
  - **Mitigation:** out of scope for v1; document as known limitation.

---

## Cross-cutting acceptance

- [ ] No phase 07 feature regresses earlier phases (all existing tests still pass).
- [ ] CDK changes (S3 bucket, lifecycle, Cognito group) reviewed and documented.

## Estimate

2 weeks.
