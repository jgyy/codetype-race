# Phase 05 — Quick-Win Features

Bundles **B1 Spectator**, **B2 Practice**, **B3 Snippet filters**, **B6 Rematch**.

## Goal

Validate the new architecture (Phases 02–04) by shipping four small, high-value features that touch every layer (schema, repo, machine, UI).

---

## B6 — Rematch

### Backend
- `lambdas/http/createRoom.ts`: accept optional `previousRoomId` in `CreateRoomRequestSchema`. If supplied, copy the player roster (minus disconnected) and same `snippetId` (or pick a new snippet if `newSnippet: true`).
- `RoomRepo.create` accepts a `seedPlayers?: Player[]` arg.

### Frontend
- `roomMachine`: add `REMATCH` event in `finished` state. Action: POST to `/rooms` with `previousRoomId`, then transition to `connecting` with new roomId/joinCode.
- `Podium.tsx`: add **Rematch** button (host-only).

### Acceptance
- [ ] Clicking Rematch creates new room with same players auto-joined.
- [ ] Non-hosts see "Waiting for host to start rematch."
- [ ] Spectators carry over as spectators.

---

## B2 — Practice mode

Single-player typing run. No WS, no DDB writes (except history opt-in).

### Backend
- New endpoint `GET /snippets/random?language=&difficulty=` → `SnippetRepo.random(filters)`.
- New endpoint `POST /history/practice` (auth required) — records a practice run in user history with `mode: 'practice'`.

### Frontend
- New route: `web/src/app/practice/page.tsx`.
- New machine `practiceMachine.ts`:
  ```
  loading → ready → racing → finished
  ```
  No WS actor. `cursorThrottleActor` not needed (no broadcast).
- Reuses `<TypingArea>` and `<Podium>` (single-player variant).
- "Try another" button → re-fetch random snippet.

### Acceptance
- [ ] `/practice` renders without auth.
- [ ] Authed users see "Save to history" toggle.
- [ ] Filters (language, difficulty) persist via URL params.
- [ ] No WS connection opened on this route.

---

## B3 — Snippet filters + GSI

### Data
- `data/snippets.json`: each entry gains `language: string`, `difficulty: 1|2|3|4|5`, `tags: string[]`.
- `scripts/seed-snippets.ts`: writes new attributes; idempotent.

### Infra
- `infra/lib/...`: add GSI `byLangDifficulty` to Snippets table:
  - PK: `LANG#<language>`
  - SK: `DIFF#<n>#<snippetId>`
- Update CDK stack; document new index in `docs/01codetype-race-plan.md`.

### Backend
- `SnippetRepo.random({ language?, difficulty? })`: query GSI, page, randomly pick one.
  - Implementation: query with `Limit: 25`, pick `arr[Math.floor(Math.random() * arr.length)]`.
- `SnippetRepo.list(filters)`: full pagination for admin/UI listings.

### Frontend
- `web/src/app/host/page.tsx`: add language `<select>` and difficulty `<input type="range">`.
- Persist last-used filters in `localStorage`.
- `CreateRoomRequest` includes filters; `createRoom` resolves snippet via `SnippetRepo.random`.

### Acceptance
- [ ] Host can pick language + difficulty before creating room.
- [ ] Practice mode uses same filters.
- [ ] GSI documented in CDK stack comments.
- [ ] Seed script populates new fields for all existing snippets.

---

## B1 — Spectator mode

### Backend
- WS connect: query param `?role=spectator` (default `racer`). Stored in `ConnectionRepo`.
- `ws/start.ts`: only counts racers for "all ready."
- `ws/finish.ts`: spectators excluded from `results`.
- `stream/broadcast.ts`: spectators receive all broadcasts (no special filtering).
- HTTP `joinRoom`: `JoinRoomRequest.role` accepted; spectators don't increment racer count limit.

### Frontend
- Join flow: toggle "Join as spectator" on the join page.
- `roomMachine` context already has `spectators: Player[]`.
- `Lobby.tsx`: separate panel for spectators (smaller, dimmed).
- `Race`/`Podium`: spectators see UI but no `<TypingArea>` input — replaced by other-players' progress focus view.

### Acceptance
- [ ] Spectator can join a full (8-racer) room.
- [ ] Spectator does not block start.
- [ ] Spectator sees live cursors but cannot type.
- [ ] Podium does not list spectators in results.

---

## Cross-cutting acceptance

- [ ] All four features share zero ad-hoc code; each respects schemas/repos/middleware from Phase 03.
- [ ] No new bypasses of the FSM in `RoomClient`.

## Test plan

- **B6:** integration test `tests/handlers/createRoom.rematch.test.ts`.
- **B2:** machine test `practiceMachine.test.ts`; component test for `/practice`.
- **B3:** `SnippetRepo.random.test.ts` with mocked GSI; manual verification of CDK GSI deployment.
- **B1:** integration test simulating 8 racers + 2 spectators; verify start gating.

## Risks / mitigations

- **Risk:** GSI hot partition on popular languages.
  - **Mitigation:** good enough for current scale; if traffic grows, add a write-sharding suffix to PK (`LANG#javascript#<0-9>`).
- **Risk:** Spectator role abused to scrape race state.
  - **Mitigation:** auth still required to join; rate limit join attempts per IP in middleware.
- **Risk:** Rematch race condition if host clicks twice.
  - **Mitigation:** `RoomRepo.create` accepts an idempotency key derived from `previousRoomId + hostId`.

## Estimate

1 week.
