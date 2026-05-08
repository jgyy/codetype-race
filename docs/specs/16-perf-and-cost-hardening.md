# Phase 16 — Performance & Cost Hardening

## Goal

Drive down end-to-end **latency** and **per-MAU cost** without changing observable behavior. Targets:

| Metric | Current (rough) | Target |
|---|---|---|
| `FinishRace` p99 latency | ~250 ms | ≤ 150 ms |
| `JoinRoom` p99 latency | ~180 ms | ≤ 100 ms |
| WS broadcast e2e (publish→client paint) | ~120 ms p99 | ≤ 70 ms p99 |
| Cold-start p99 (HTTP handlers) | ~280 ms | ≤ 200 ms |
| First Contentful Paint (FCP) on `/` | ~1.6 s | ≤ 900 ms |
| Largest Contentful Paint (LCP) on `/` | ~2.4 s | ≤ 1.6 s |
| Bundle size (`/` initial JS) | ~340 kB gzip | ≤ 180 kB gzip |
| DynamoDB cost per MAU/day | ~$0.018 | ≤ $0.010 |
| Lambda invoke + duration cost per race | ~$0.0009 | ≤ $0.0006 |

This phase is **measurement-driven**. No optimisation lands without before/after numbers tied to the Phase 15 dashboards.

## Motivation

- Cost-per-MAU determines our runway for free-to-play. The current trajectory is sustainable, but easy improvements compound.
- Latency wins are user-visible: `FinishRace` p99 cut by ~100 ms means the podium animation starts before the last keystroke's noise has died down.
- Bundle size is currently dominated by `xstate`, `@aws-amplify/auth`, and a handful of tree-shaken-poorly UI deps. Reducing it cleans the door for mobile (Phase 12).

## Scope

### In

#### Backend

- **DDB read sharding** for hot leaderboard queries.
- **Lambda SnapStart** for HTTP handlers.
- **Reserved concurrency** rebalance to reduce cold-starts where it matters and shed cost where it doesn't.
- **WS connection pooling**: reuse `ApiGatewayManagementApi` clients across invocations.
- **Cursor-flush coalescing** tightened (already 50 ms / 20 Hz; profile if we can get away with 100 ms in low-stakes practice rooms).
- **DDB GSI projection trimming** — current GSIs `KEYS_ONLY` are fine; one is `ALL` and is overpaying for cost.
- **Conditional broadcasts** — skip `postToConnection` for connections that haven't acked a previous frame within `T_max` (drop frames for slow consumers, keep room healthy).

#### Frontend

- **Bundle budget enforced in CI** (180 kB gzip for `/`).
- **Route-split** + **lazy hydration** — only `/host` and `/room` pull XState; other routes don't.
- **Replace `@aws-amplify/auth`** UI components (we keep the SDK for token mgmt; UI is custom anyway).
- **Self-host fonts** with `next/font` to drop the Google Fonts request.
- **Image optimisation** — favicon, og-image, podium emojis as inlined SVG.
- **Service worker**: precache dropped to "shell only" to avoid blocking install on slow networks (Phase 12 set the foundation).

#### CDN / Caching

- **CloudFront cache keys** restructured: query string allowlist instead of full forward, headers narrowed.
- **`Cache-Control` for API responses**:
  - `/snippets/:id` → `max-age=86400, immutable`
  - `/snippets?language=...` → `s-maxage=60`
  - `/leaderboard?lang=...&season=...` → `s-maxage=10` (current season), `s-maxage=86400` (archived)
  - `/me/*` → `private, no-store`

### Out

- Multi-region failover (single region stays).
- Aurora / OpenSearch read replicas.
- HTTP/3 (handled by CloudFront default).
- Worker-thread offloading for any handler.
- Adopting alternative Lambda runtimes (Bun, LLRT) — fun, but a separate decision.

## Backend tasks

### 16.1 DDB read sharding for leaderboards

Today's leaderboard query is `GSI1PK = RATING#<lang>` sorted by rating descending, `Limit = 100`. At low volume that's fine. At peak (post-tournament), the partition gets hot.

#### Approach

Shard the leaderboard partition into 16 sub-partitions:

- Write side: each rating-row writes both a global row (`RATING#<lang>`) and a sharded row (`RATING#<lang>#SHARD#<sha1(userId) mod 16>`).
- Read side: Top-100 is computed by:
  - 16 parallel `Query` calls (one per shard), `Limit = 100` each, projection `[userId, rating]` only.
  - In-memory merge → top 100.
- Latency: the slowest shard dominates p99, but each shard is much hotter-cache-friendly.

#### When this isn't worth it

If a single partition's RCU is < 30% of its limit at peak, the sharding is pure overhead. We measure first, then enable behind a flag per language.

### 16.2 Lambda SnapStart

Node.js Lambda SnapStart is GA. Steps:

- Enable on HTTP handlers (`InitTime` + handler init in their `_container.ts` is the slow part — perfect SnapStart candidate).
- **Not** on stream/cron handlers (less benefit, more churn).
- Costs ~$0.0001 per snapshot invocation; net win as long as cold-start savings outweigh.
- Pay attention to "uniqueness on init" issues: anything seeded from `Math.random` or `Date.now` at init time is now identical across invocations. Audit:
  - `CryptoRandom` adapter (Phase 13) — uses `crypto.randomUUID()` which is fine *per call*, but if any module-init caches a uuid, fix it.
  - HTTP keep-alive connections — reset on snapshot restore by AWS, no action needed.

Expected: cold-start p99 280 ms → 100–140 ms.

### 16.3 Reserved concurrency rebalance

Per-handler reserved concurrency today is uniform. Move to:

| Handler class | Reserved | Provisioned |
|---|---|---|
| `http/rooms/*`, `http/races/*` (hot) | 100 | 5 (peak only via schedule) |
| `http/snippets/*`, `http/leaderboard/*` | 50 | 0 |
| `http/profile/*` | 30 | 0 |
| `ws/*` | 200 | 0 |
| `stream/*` | 10 | 0 |
| `cron/*` | 2 | 0 |

Total reserved capacity stays under account default (1000) with margin. Provisioned concurrency is scheduled (08:00–23:00 SGT weekdays) to match the SG student usage curve.

### 16.4 WS connection pooling

`ApiGatewayManagementApi` client today is constructed inside the broadcast handler. Move to module scope (single instance per execution environment), with `keepAlive: true` on the underlying HTTP agent.

Expected: ~20 ms saved per `postToConnection` after cold start.

### 16.5 Cursor flush — adaptive

Practice rooms (no opponents) don't need 20 Hz cursor flushes. Adaptive policy:

- `room.kind = 'practice'` or solo → no cursor broadcasts at all (state stays local).
- `room.players.size <= 2` → 10 Hz.
- `room.players.size >= 5` → 20 Hz (unchanged).
- `cursor.lite=true` (mobile, Phase 12) → 5 Hz, capped.

The `cursorThrottleActor` reads a per-room rate from the `Room` row.

### 16.6 GSI projection trim

Audit `infra/lib/codetype-stack.ts`. The GSI for `RatingRow` projects `ALL`. We only ever read `[userId, rating, language]`. Switch to `INCLUDE [rating, language]` (PK is automatic).

Caveat: changing GSI projection requires GSI rebuild, which is online but takes minutes. Schedule for low-traffic window.

Cost saving: ~30% off ratings GSI write cost.

### 16.7 Conditional / drop-on-slow broadcasts

Today, broadcast tries every connection sequentially with retry. Slow consumers slow the whole fanout.

New policy:

- Each connection has a `lastAckSeq` tracked in DDB.
- Before broadcasting a frame seq N, if `N - lastAckSeq > 100`, drop the frame for that connection (mark connection as "stalled").
- After 5 consecutive drops, force-disconnect the connection ("client hard-stuck"). The client reconnects and replays via Phase 14's seq-based catch-up, which uses an HTTP backfill — not a WS one — so the room isn't dragged down.

Acceptance: this is invisible to healthy clients; only stalled ones experience reconnection.

## Frontend tasks

### 16.8 Bundle budget

`web/scripts/check-bundle.ts`:

- Parses `.next/build-manifest.json`.
- Asserts `pages/_app` + `pages/index` < 180 kB gzip combined.
- Asserts no individual chunk > 250 kB gzip.
- CI fails if exceeded; budget bumps require a PR comment justification.

### 16.9 Route-split

XState machines move from top-level imports to per-route dynamic imports:

```ts
// web/src/app/host/page.tsx
const RoomMachineLazy = dynamic(() => import('@/machines/roomMachine'), { ssr: false });
```

Effect: home page bundle drops by ~80 kB gzip.

### 16.10 Auth UI removal

`@aws-amplify/auth` ships a hefty UI tree. We use only token storage. Replace with `oslo`-style hand-rolled adapter (or just `aws-amplify/utils` direct token APIs):

- `web/src/lib/auth.ts` — 200-line wrapper exposing `signIn`, `signOut`, `getIdToken`, `onAuthEvent`.
- Bundle drop: ~70 kB gzip.

### 16.11 Self-host fonts

```ts
import { Inter, JetBrains_Mono } from 'next/font/google';
const inter = Inter({ subsets: ['latin'], display: 'swap' });
const mono  = JetBrains_Mono({ subsets: ['latin'], display: 'swap' });
```

Result: zero `fonts.googleapis.com` requests; FCP improvement ~150 ms on slow connections.

### 16.12 Image / icon work

- Favicon → 512 px source PNG → generate sizes via `pwa-asset-generator` (already in Phase 12 toolchain).
- Podium emojis → inline SVG (`/web/src/components/icons/`), drop the emoji-rendered fallback that pulls noto-color-emoji.
- All `<img>` usage audited; switch to `next/image` in static-export mode (which produces `<img loading="lazy">` with explicit dimensions).

### 16.13 Service worker precache slim

The Phase 12 SW currently precaches the entire `_next/static` directory. Trim to "app shell": HTML + main JS chunks for `/`, `/host`, `/practice`. Other routes lazy-fetched on first visit. Drop precache size ~3 MB → ~600 kB.

## CDN / Caching tasks

### 16.14 CloudFront cache keys

Today, CloudFront forwards all query strings and most headers. Restructure:

- HTML routes: forward only `Authorization` header (already proxied by APIGW); allow no query strings → maximises cache hit.
- `/api/*`: forward `Authorization`; allow `language`, `season`, `lang` only; rest stripped at edge.

Effect: cache hit ratio for `/api/snippets` projected to climb 60% → 85%.

### 16.15 Cache-Control headers

Set per-route in handler responses; the CloudFront response policy passes through `Cache-Control`. Drop `Vary: Cookie` where not needed.

| Route | Cache-Control |
|---|---|
| `GET /snippets/:id` | `public, max-age=86400, immutable` |
| `GET /snippets?language=ts` | `public, s-maxage=60, stale-while-revalidate=300` |
| `GET /leaderboard?lang=ts&season=current` | `public, s-maxage=10` |
| `GET /leaderboard?lang=ts&season=2026-S1` (archived) | `public, max-age=86400, immutable` |
| `GET /tournaments` | `public, s-maxage=10` |
| `GET /tournaments/:id` (status=running) | `public, s-maxage=2` |
| `GET /tournaments/:id` (status=finished) | `public, max-age=86400, immutable` |
| `GET /me/*`, `POST/PUT/PATCH/DELETE /*` | `private, no-store` |

## Cost monitoring

A new dashboard "Cost watch" (Phase 15) per service:

- Daily DDB write/read units.
- Lambda GB-seconds, invocations.
- API Gateway request count.
- CloudFront bytes out.
- S3 GET/PUT.

Alarm: any cost item up >50% week-over-week, unless tied to known traffic growth (annotated).

## Acceptance criteria

- [ ] Latency targets in the table at the top met for 7 consecutive days post-deploy (validated from Phase 15 dashboards).
- [ ] Bundle size CI gate enforced; current size publicly visible in `README.md` badge.
- [ ] SnapStart enabled on all HTTP handlers; reported cold-start p99 ≤ 200 ms.
- [ ] Cursor adaptive flush implemented; metric `app.cursor.coalesce_size` shows higher values for low-player rooms.
- [ ] Drop-on-slow broadcast: stalled connections disconnect cleanly; verified via chaos test that injects 2 s delay on a single connection.
- [ ] CloudFront cache-hit rate for `/api/snippets` ≥ 85% over 24 h.
- [ ] Pre/post numbers attached to the merge PR in a benchmark table.
- [ ] Cost-watch dashboard in production; week-over-week alarm fires only on real anomalies (no false positives in trial week).

## Test plan

### Unit / integration

- Cursor adaptive policy: golden tests per room kind & player count.
- Drop-on-slow: simulated slow consumer doesn't slow the room broadcast loop.
- Bundle-budget script: known-fail and known-pass fixtures.

### Load (k6 or similar)

- 100 RPS hitting `/leaderboard?lang=ts` for 5 min, with and without sharding.
- 50 concurrent rooms × 4 players × 30 s race; observe broadcast e2e p99.

### Synthetic

- WebPageTest run (or Playwright `page.goto` with `--lighthouse` flag) for `/`, `/practice`, `/host` on Fast 3G — assert FCP and LCP under target.

### Manual

- A/B compare cold-start logs before/after SnapStart.
- Spot-check cost dashboard daily for first week.

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| Sharding adds latency for cold leaderboards | Feature-flag per-language; only enable when read-throttle alarm is observed. |
| SnapStart breaks initialisation that assumes per-invocation freshness | Audit checklist; init-time `Math.random` / `Date.now` lint rule added to ESLint. |
| Drop-on-slow disconnects healthy clients on a brief network blip | Threshold tuning (5 consecutive drops, 100-frame gap) + chaos tests; per-region monitoring. |
| Bundle budget blocks legitimate feature work | Budgets are PR-comment-overridable with reviewer approval; raised in 20 kB increments only. |
| GSI projection rebuild stalls deploy | Run during low-traffic window; CDK uses `replaceOldResources: true` strategy with manual rollout flag. |
| CloudFront cache change invalidates everything | Phased rollout via CloudFront cache policy versions; old policy retained for 7 days. |
| Auth UI replacement breaks sign-in flow | Behind a `?auth=v2` flag for one week; sign-in success rate metric watched. |

## Migration / rollout

1. Land instrumentation prerequisites (Phase 15 must be in production).
2. Land SnapStart + cold-start measurement; verify before tuning anything else.
3. Land cursor adaptive + drop-on-slow under flags; ramp 10% → 100%.
4. Land sharding behind per-language flag; enable on `*` global first.
5. Land frontend bundle work in batches: route-split → fonts → auth UI → SW shrink.
6. Land cache-key/header changes last (most observable risk on freshness).

## Rollback

- Each item is independently flagged or revertable via CDK config.
- SnapStart toggleable at function level.
- Sharding is a per-language flag; flipping off restores single-partition reads (still correct, just slower).
- Bundle changes are revert-PRs.
- Cache-policy changes are kept in versioned CloudFront cache policies; switch back to previous version with one CDK property change.

## Estimate

10 dev-days. ~2 d SnapStart + cold-start tuning, 2 d sharding + GSI tuning, 1 d cursor adaptive + drop-on-slow, 2 d frontend bundle work, 1 d CDN/cache headers, 1 d cost dashboard + alarms, 1 d benchmarking + write-up.
