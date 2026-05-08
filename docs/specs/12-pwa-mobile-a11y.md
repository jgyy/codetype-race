# Phase 12 — PWA, Mobile & Accessibility

## Goal

Make codetype-race **installable, offline-capable, mobile-usable, and WCAG 2.2 AA-conformant** without compromising the desktop race-typing experience.

Three pillars:

1. **PWA**: service worker, web manifest, offline-first practice mode, install prompts on iOS/Android.
2. **Mobile**: responsive layout below 768 px, virtual-keyboard-aware composer, touch-targets ≥ 44 px, reduced-data variant of the cursor stream.
3. **Accessibility**: keyboard-only flow end-to-end, screen-reader-announced race state, prefers-reduced-motion variants, colour-contrast AA across all themes.

## Motivation

- Static-export Next.js + S3/CloudFront is **already PWA-shaped** — adding a service worker and manifest is the minimum viable path to an installable app, no SSR runtime required.
- 42 Singapore students often warm up on phones during commute. Practice mode (no WS, snippet-only) is the perfect mobile shape.
- Accessibility is a **correctness requirement**, not a feature. The current race UI relies heavily on visual cursors and colour-coded lanes, which is invisible to screen-reader users today.

## Scope

### In

- Web App Manifest (`/manifest.webmanifest`) with icons (192, 512, maskable).
- Workbox-driven service worker, generated at build, served at `/sw.js`.
- Cache strategies (see "Caching strategies" below).
- Offline practice mode: snippets pre-cached on first visit, results queued and synced when online.
- "Install app" prompt with iOS/Android-specific instructions.
- Mobile race layout: vertical lanes, single-cursor view of leader, bottom-anchored input.
- Mobile virtual keyboard handling (visualViewport API, scroll lock, IME composition).
- Reduced-cursor mode: server pushes cursor frames at 5 Hz to mobile clients (vs 20 Hz desktop) with `cursor.lite=true` query.
- WCAG AA colour audit + dark/light/high-contrast themes.
- Full keyboard-only path: every interactive surface reachable, focus rings visible, skip-links present.
- Screen-reader race state: `aria-live="polite"` region narrating "you're 12 characters behind the leader", throttled to one announcement per ~3 s.
- `prefers-reduced-motion` honoured for cursor easing, podium confetti, level-up modal.

### Out

- Native iOS/Android apps (Capacitor/React Native) — explicit no.
- Push notifications — deferred to Phase 13+.
- Voice control / dictation — out of scope.
- True offline races (multiplayer offline) — physically impossible; offline practice only.
- Right-to-left script support — separate from a11y work, deferred to Phase 14 i18n.

## Architecture

### PWA layer

Next.js 16 with `output: 'export'` produces a static asset tree under `web/out/`. The service worker is generated at build time by a small `web/scripts/build-sw.ts` using `workbox-build`:

```
web/
  next.config.ts              # output: 'export'
  public/
    manifest.webmanifest
    icons/icon-{192,512,512-maskable}.png
  scripts/
    build-sw.ts               # post-build hook: bun run build && bun scripts/build-sw.ts
  src/
    sw/
      strategies.ts           # workbox routes config
      offlineQueue.ts         # background-sync queue for offline race results
```

CDK invalidates `/sw.js`, `/manifest.webmanifest`, and `/index.html` on every deploy (the rest of `/_next/static/*` is content-hashed and never invalidated).

### Caching strategies

| Asset class | Strategy | TTL | Notes |
|---|---|---|---|
| `/_next/static/*` | CacheFirst | immutable | content-hashed by Next |
| `/index.html`, route HTMLs | StaleWhileRevalidate | 24 h | always fall back to cache when offline |
| `/manifest.webmanifest`, `/sw.js` | NetworkOnly | — | never cache the SW itself |
| `/api/snippets/*` | NetworkFirst, fallback to cache | 7 d | enables offline practice |
| `/api/profile/me` | NetworkFirst | 1 h | shows last-known profile when offline |
| WebSocket | (not cached) | — | offline mode hides multiplayer entry points |

### Offline practice flow

1. On first authenticated visit, prefetch a "starter pack" of 30 snippets across languages (lazy: triggered after `idle` for 3 s).
2. When user opens `/practice` and is offline, hydrate the snippet picker from cache.
3. Race results computed client-side (already pure functions in `@codetype/shared/wpm`).
4. Result is `Put` into IndexedDB queue (`codetype-offline-runs`) with envelope `{ id, finishedAt, snippetId, wpm, accuracy, ... }`.
5. On reconnect, the offline queue worker drains via background-sync to `POST /me/practice-runs` (idempotent on `id`).

### Background sync

Use the `workbox-background-sync` plugin. If unsupported (Safari), fall back to a `visibilitychange` listener that drains the queue when the tab regains focus.

## Mobile UI

### Breakpoints

| Width | Layout |
|---|---|
| ≥ 1280 | desktop default (current) |
| 768–1279 | tablet (sidebar collapses to drawer) |
| < 768 | mobile (vertical race, bottom input) |

### Mobile race screen

```
┌────────────────────────────┐
│  Leader: alice  91 wpm     │  ← single-line status
│  You:    32%   ░░░░░░      │  ← progress bar
├────────────────────────────┤
│                            │
│  function add(a, b) {      │  ← snippet display
│    return a + b;           │     monospace, 16px
│  }                         │     line-height 1.6
│                            │
├────────────────────────────┤
│ [virtual keyboard area]    │  ← visualViewport-aware
└────────────────────────────┘
```

Key choices:

- **Single-leader view** instead of N lanes — at 360 px width N lanes are illegible. Tap "More" to see a sortable mini-leaderboard sheet.
- **Snippet doesn't scroll the page** — it scrolls inside its container. The composer is fixed via `position: sticky; bottom: env(safe-area-inset-bottom)`.
- **IME composition events** are debounced to avoid emitting per-keystroke cursor events for languages with composed input. We already do `cursor flush 50ms` so this only matters for IMEs that emit composition starts/ends.

### Touch targets

- Min 44×44 logical px for every tap target (Tailwind `min-h-11 min-w-11`).
- Increase spacing in lobby roster: 12 → 16 px gap on mobile.
- Number-pad style chips for join code on the join screen (`/join`) — 6 large slots.

### Reduced cursor stream

Mobile clients connect to WS with `?cursor.lite=true`. Server-side, the `CURSOR_FLUSH` actor coalesces to 200 ms (5 Hz) instead of 50 ms (20 Hz) for those connections. Effect: 4× fewer messages, ~75% lower data plan use.

This is implemented as a **per-connection writer policy** rather than a server-wide config, so a desktop user in the same room still gets full 20 Hz.

## Accessibility

### Keyboard-only flow

Every page must be operable with `Tab`, `Shift+Tab`, `Enter`, `Escape`, and arrow keys where appropriate:

- Skip-link at top: "Skip to main content" → focus jumps to `<main>`.
- Focus ring: 2 px solid using `theme.colors.focus` (token), never removed via `outline: none` without a replacement.
- All buttons are `<button>`, all links are `<a href>`. No `<div onClick>`.
- Modals trap focus and restore on close.
- Race composer keeps focus inside the input; arrow keys do not navigate within the read-only snippet pane.

### Screen-reader narration

A new `<RaceLiveRegion>` component owns an `aria-live="polite"` `<div>` and is fed throttled summaries by a small reducer:

```ts
function announce(state: RaceState): string | null {
  // throttled: only announce if >3s since last announcement
  if (state.justFinished) return `You finished. ${state.wpm} WPM, ${pct(state.accuracy)} accuracy.`;
  if (state.justOvertook) return `You passed ${state.passedName}.`;
  if (state.justFell) return `${state.passerName} passed you.`;
  if (state.everyN(3000)) return `${state.charsLeft} characters left.`;
  return null;
}
```

The race lanes themselves have `role="img"` + `aria-label="..."` describing the visual rather than exposing per-character cursor positions (which would flood the SR queue).

### Colour contrast

- Audit script: `web/scripts/audit-contrast.ts` reads `tailwind.config.ts` token pairs (text-on-bg pairs) and asserts contrast ≥ 4.5:1 (AA normal text) or ≥ 3:1 (AA large text).
- CI runs the script; failure fails the build.
- The "racing" red (used for the leader) currently fails on dark theme — fix in this phase.

### Reduced motion

- Cursor easing animation: disabled, snap to position.
- Confetti on podium: replaced with a static "Winner" banner.
- XP toast slides become fades.
- All gated behind `@media (prefers-reduced-motion: reduce)`.

## Frontend tasks

### New components

- `<InstallPrompt>` — detects `beforeinstallprompt` (Android/Desktop) or shows iOS instructions card.
- `<OfflineBanner>` — top banner: "You're offline — practice runs will sync when you're back".
- `<MobileRaceLayout>` — variant of `<RaceScreen>` rendered when viewport < 768.
- `<RaceLiveRegion>` — `aria-live` narrator described above.
- `<FocusRing>` — wrapper that ensures a visible ring when keyboard-focused, hidden when mouse-focused (`:focus-visible` based).
- `<SkipLink>` — first focusable element in `<body>`.

### XState additions

- `offlineSyncActor` — sibling of `wsActor`. Watches `navigator.onLine` + visibility, drains the IndexedDB queue, posts to `/me/practice-runs`.

```
states: idle → online (drainOnce) → idle ; idle → offline → idle
events: ONLINE, OFFLINE, VISIBLE, ENQUEUE, DRAIN_OK, DRAIN_FAIL
context: { queueLength: number }
```

### Tailwind / theme

- New token `theme.colors.focus` and `theme.colors.contrast` (high-contrast theme overrides).
- `prefers-reduced-motion` variants: add `motion-safe:` and `motion-reduce:` to relevant utility usages (cursor lerp, podium confetti).
- High-contrast theme (`data-theme="hc"`) — pure black/white + saturated accents; toggled in settings.

## Backend changes

Minimal:

- `POST /me/practice-runs` — already exists from Phase 05; ensure it accepts batch (`runs: PracticeRun[]`).
- `GET /api/snippets/starter-pack?languages=ts,py,go&n=30` — new, returns 30 snippets in one call to seed the offline cache. Cached on CloudFront for 1 h.
- WS: server reads `cursor.lite=true` query string at `$connect`, stores it on the connection's row, and the cursor-flush stream Lambda checks the flag before emitting to that connection.

## Acceptance criteria

- [ ] Lighthouse PWA score ≥ 90 on `/` and `/practice` (run in CI on a deployed preview).
- [ ] Lighthouse Accessibility score = 100 on `/`, `/practice`, `/host`, `/room/[id]`, `/profile`.
- [ ] Service worker registers on first visit; second visit `index.html` served from cache offline.
- [ ] Offline → race a practice snippet → reconnect → run is in `/history` within 30 s.
- [ ] Manifest installable on Chrome Android (verified by `webapp-manifest-validator`).
- [ ] Mobile composer remains visible above the virtual keyboard on iOS Safari and Chrome Android (manual + Playwright iPhone 14 emulation).
- [ ] Screen-reader narration verified with VoiceOver (macOS) and NVDA (Windows): finishing a race produces exactly one announcement of WPM + accuracy.
- [ ] Keyboard-only Playwright run completes a full race start-to-podium without using `page.click` (all interactions via `keyboard.press`).
- [ ] Contrast audit script passes; CI gate enforces it.
- [ ] `prefers-reduced-motion` reduces cursor animation duration to 0 ms in browser dev tools simulation.
- [ ] Reduced cursor stream halves WS message count in a 4-player room with one mobile client (instrumented via `CloudWatchMetricFilter`).

## Test plan

### Unit

- `offlineQueue.ts` — enqueue/dequeue, dedupe by `id`, max queue size 100.
- `RaceLiveRegion` reducer — throttle correctness, finished-once invariant.
- `audit-contrast.ts` — known-good and known-bad fixtures.

### Integration

- Service worker install + activate against a test snapshot; cache hits/misses recorded.
- Offline → online sync end-to-end with mock fetch.

### E2E (Playwright)

- iPhone 14 viewport: full race flow, podium visible.
- Keyboard-only desktop run: see acceptance.
- Offline practice: `context.setOffline(true)`, race, `setOffline(false)`, assert sync.
- Reduced motion: `emulateMedia({ reducedMotion: 'reduce' })` then assert no `transition: transform` on cursor element.

### Manual a11y (one-time, recorded)

- VoiceOver tour video.
- NVDA tour video.
- High-contrast theme tour.

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| Service-worker bug bricks the site for cached users | SW exposes a `/sw-killswitch` route; `index.html` ships a 1-line bootstrap that, on detecting a `?reset=1` query, calls `navigator.serviceWorker.getRegistrations().forEach(r=>r.unregister())`. Documented in runbook. |
| iOS Safari ignoring `manifest` install hints | Provide explicit "Add to Home Screen" instructions card on iOS UA detection. |
| Background sync unsupported (Safari) | Fallback `visibilitychange` drain. |
| `aria-live` flood from rapid race events | Throttle reducer + per-event-type minimum gap; tested with rapid event fixture. |
| Offline cache balloons over time | LRU cap at 50 snippets; eviction handled by Workbox `ExpirationPlugin`. |
| `cursor.lite` regression breaks desktop | Per-connection flag on `Connection` row, default off; A/B test gates rollout. |

## Migration / rollout

1. Ship manifest + icons + theme token cleanup (no SW yet).
2. Ship SW behind `?sw=on` query for staff testing.
3. Enable SW for all users; monitor `sw-error` JS reports for one week.
4. Ship offline practice + sync queue.
5. Ship a11y improvements (live region, focus ring rework, contrast fix) — these can ship in parallel.
6. Ship mobile layout last (largest UX surface).

## Rollback

- `ENABLE_SW=false` in build env stops emitting `/sw.js`. Existing clients hit `/sw-killswitch` if their cached `/index.html` includes the bootstrap stub.
- Mobile layout is gated by viewport media query — no rollback needed; revert the component.
- Reduced cursor stream gated by query flag — drop the flag from clients to roll back server behavior.

## Estimate

10 dev-days. ~2 d SW + manifest + offline cache, 2 d offline practice + sync queue, 3 d mobile race layout, 3 d a11y (focus, live region, contrast, reduced motion).
