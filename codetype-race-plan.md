# CodeType Race — Project Plan (P2: Team / Multi-User)

**Programme:** B1 Builders — Project 2 of 2
**Submission deadline:** 15 May 2026
**Target build window:** ~5–6 days (after P1 ships)

---

## Concept

Real-time multiplayer typing race for code snippets. A host creates a room, shares a 6-character join code, 2–8 players join a lobby, everyone races the same snippet at the same time, and a podium shows the winner with WPM/accuracy.

**Why it qualifies as "team / multi-user":** the room is a shared resource. Multiple users mutate the same game state concurrently (their cursor positions, completion times, room status). Reqs auth, real-time sync, and conflict-safe writes — none of which P1 needs.

**Pairing with P1:** same domain (code typing) → component reuse for the typing engine. The interesting story for the interview is *what had to change* when going from single-player to authoritative server state.

---

## Stack

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui (same as P1)
- **Backend:** Next.js Route Handlers + Supabase (Postgres + Auth + **Realtime**)
- **Realtime transport:** Supabase Realtime channels (Postgres changes + presence + broadcast)
- **Auth:** Supabase email magic link (required this time — no guest mode for hosts; players can join with a display name only)
- **Deploy:** Vercel

**Why Supabase Realtime over Socket.IO:** zero ops, presence + broadcast built in, scales to programme demo without a separate server. Trade-off: harder to optimise message rate; mitigated by throttling cursor broadcasts to ~10 Hz.

---

## Core features (must-have for submission)

1. **Create room** — host signs in, picks language + snippet, gets a 6-char join code.
2. **Join room** — anyone with the code joins via display name (auth optional for players).
3. **Lobby** — live presence list, host can start when ≥2 players.
4. **Countdown** → race starts → everyone types the same snippet.
5. **Live opponent cursors** — see other players' progress as a coloured bar per player.
6. **Live leaderboard** — sorted by % progress, updates in realtime.
7. **Finish & podium** — first 3 players highlighted; final WPM/accuracy per player.
8. **Room history** — host can view past races in their room.

## Stretch (only if ahead of schedule)

- Best-of-3 series mode.
- Spectator mode (read-only, no typing).
- Per-room ELO ranking.

---

## Data model (Supabase / Postgres)

```sql
profiles      (id uuid pk, email text, display_name text)
rooms         (id uuid pk, code text unique, host_id fk, snippet_id fk,
               status text, -- 'lobby' | 'running' | 'finished'
               created_at, started_at, finished_at)
room_players  (room_id fk, user_id fk nullable, display_name text,
               joined_at, finished_at, wpm float, accuracy float, progress float,
               primary key (room_id, display_name))
snippets      (id uuid pk, language text, title text, code text)
```

RLS:
- `rooms`: anyone can SELECT by code; only host can UPDATE.
- `room_players`: any room member can SELECT; players can only UPDATE their own row.

**Realtime channels:**
- `room:{code}` (broadcast) — cursor positions (high-frequency, ephemeral).
- `room:{code}:db` (Postgres changes) — room status transitions, player joins/leaves.

---

## Folder structure (matches B1 spec)

```
codetype-race/
├── README.md
├── LICENSE
├── .gitignore
├── package.json
├── src/
│   ├── app/
│   │   ├── (marketing)/        # landing
│   │   ├── room/[code]/        # lobby + race + podium
│   │   └── api/                # route handlers
│   ├── components/
│   │   ├── typing/             # SHARED with codetype-solo (copy initially, extract later)
│   │   ├── race/               # opponent cursors, leaderboard, podium
│   │   └── lobby/
│   ├── lib/
│   │   ├── supabase/
│   │   └── realtime/           # channel wrapper, throttled broadcast
│   └── server/
├── tests/
├── docs/
│   ├── ai-log.md
│   └── architecture.md         # MUST cover: state ownership, race conditions, room lifecycle
├── scripts/
├── assets/
└── data/
```

---

## Build sequence (6 days)

| Day | Goal | Deliverable |
|---|---|---|
| 1 | Scaffold + auth + room CRUD | Host can create a room, join code works |
| 2 | Lobby + presence | Multiple browsers see each other in lobby |
| 3 | Race start + countdown + shared snippet | Race starts simultaneously across clients |
| 4 | Live cursors + leaderboard via Realtime broadcast | Two browsers race, see each other's progress |
| 5 | Finish detection + podium + room history | Full happy path works end-to-end |
| 6 | Polish + reconnection handling + README + deploy | Shippable demo on Vercel |

---

## Hard problems (worth flagging in the interview)

1. **Server-authoritative finish time.** Clients can lie about WPM. Mitigation: server validates `final_progress = snippet.length` and computes `wpm = (snippet.length/5) / ((server_now - started_at)/60s)`. Client-reported WPM is only used for the live ticker, not the final score.
2. **Cursor broadcast volume.** 8 players × 60 keystrokes/min × N broadcasts each → message storm. Mitigation: throttle to 10 Hz per player; send `progress` (0–1) not raw cursor index.
3. **Player drops mid-race.** Mitigation: presence channel; if a player goes offline for >10s, they're marked DNF; race continues as long as ≥1 player still typing.
4. **Race start sync.** Network latency means "start now" arrives at different times. Mitigation: server sends `start_at_ts` (3-second future timestamp); each client counts down to that absolute time.

---

## AI workflow plan (for `docs/ai-log.md`)

Same logging discipline as P1, but with extra emphasis on:

- **Prompts where the AI got concurrency wrong** (likely: race conditions, RLS holes, double-finish bugs). These are gold for the interview's *"explain what the AI did and what you did"* line.
- **Prompts where I rejected AI's first realtime architecture** (e.g., AI is likely to suggest broadcasting full game state on every keystroke; I'll override to throttle + send progress only).
- **Tools used:** opencode for code gen; manual review of all SQL + RLS policies; manual end-to-end testing with 2 incognito windows.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Realtime sync bugs eat 2+ days | Build the sync layer in isolation Day 2 with a tiny test page (2 cursors, no game) before integrating |
| RLS misconfig leaks private data | Write a smoke test that hits the DB as anon; assert it can't see `profiles.email` |
| Vercel cold starts hurt perceived realtime | Realtime is Supabase-side, not Vercel — only the initial page load is cold |
| Hosting >2 demo players is too risky live | Pre-record a demo GIF with 4 browsers; have a live demo with 2 as backup |

---

## Demo storyline (for interview)

1. Open two browsers side-by-side.
2. Browser A: sign in → create room → share code.
3. Browser B: join with code → display name.
4. Both in lobby → host clicks Start → 3-2-1 countdown.
5. Both type the same snippet → live cursors visible across browsers.
6. Faster browser finishes → podium screen on both.
7. Open room history → see the just-completed race.

Total demo time: ~3 minutes. Pre-record a GIF as backup.

---

## Architectural story to tell at interview

> "P1 was client-authoritative — the client computed WPM and wrote it to the DB. For P2 I had to invert that: the server owns the truth (start time, finish time, snippet content), and the client only reports progress for the live UI. The clearest sign I got the boundary right is that a player editing the network request can't cheat the leaderboard — only the live ticker."

This is the kind of concrete, specific tradeoff the Step 2 rubric is grading.
