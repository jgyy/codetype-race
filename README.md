# codetype-race

[![CI](https://github.com/jgyy/codetype-race/actions/workflows/ci.yml/badge.svg)](https://github.com/jgyy/codetype-race/actions/workflows/ci.yml)

**An async code-typing leaderboard for teams.** Race curated snippets, keep persistent stats when signed in, and let Claude coach you toward weak topics on a spaced-repetition schedule.

### B1 Builders Programme — Project #2 of 2: *For team, department, or organisational use*

> *"A project that operates on shared resources and **supports multiple users** rather than a single individual."*

This repo is the **team / organisational-use** submission. Companion: [`codetype-solo`](../codetype-solo) — the individual-use project.

| Axis | This (`codetype-race`) | Companion (`codetype-solo`) |
|---|---|---|
| Rubric scale | Team / organisational use | Individual use |
| Users | Many, on shared snippets | One per install |
| Identity | Signed-in handle + scrypt PIN | PIN-only HMAC cookie |
| Shared resource | Snippets + leaderboards | None |

---

## Overview

### Problem
- **Who:** Students and early-career developers who read code fluently but type it slowly enough that interviews and pair-programming suffer.
- **Issue:** No shared, async surface where a team can practise *code* typing together, see each other's progress, and get AI coaching on personal weak topics.

### Outcome
- Async leaderboard with anonymous + signed-in attempts.
- Per-user SM-2 spaced-repetition queue for weak topics — concrete progression beyond raw WPM.
- Claude-powered hints, **strictly bounded by guardrails** — never just hands over the answer.
- Stateless HMAC session cookies with unit tests for integrity, constant-time PIN compare, and expiry.

---

## Demo

To do live during interview.

**Multi-user evidence (Project #2):** codetype-race is a **shared resource** — multiple accounts compete on the same snippets, rankings visible to anonymous visitors. Repro:
1. Open `/` — Featured race lists top 10 WPM on the most-attempted snippet; racer count visible without sign-in.
2. Register account A, race, log out. Register B in a private window, race, log out.
3. Visit `/s/<snippet-id>/leaderboard` — both accounts appear ordered by WPM alongside `(guest)` attempts.
4. `/leaderboard` shows cross-snippet ranking of signed-in users by best WPM.

Two identities, one snippet, comparative stats — the multi-user dimension that distinguishes this from the solo trainer.

---

## Technology Stack

### Frontend components
- **SvelteKit + TypeScript** — routing, server endpoints, UI.
- **Svelte 5 runes** (`$state`, `$derived`) for the typing surface.
- **CodeMirror 6** — wired for the upcoming syntax-highlighted typing surface.
- **Vite** — dev server + bundler.

### Backend components
- **SvelteKit server routes** deployed as Vercel Functions via `@sveltejs/adapter-vercel`.
- **Drizzle ORM over libSQL** — local SQLite in dev, Turso in prod. See [ADR 0001](docs/adr/0001-libsql-over-postgres.md).
- **HMAC-signed session cookie** (`<userId>.<expiry>.<sig>`), 30-day TTL, constant-time PIN compare, scrypt-hashed PINs.
- **Anthropic Claude API** — `POST /api/hint` gated by `hint-guardrails.ts`; per-attempt `ai_summary` column.
- **SM-2 spaced repetition** — `ease`, `interval_days`, `repetitions`, `next_review_at` on `topic_mastery`. See [ADR 0002](docs/adr/0002-spaced-repetition-algorithm.md).

### Claude prompt guardrails

`src/lib/server/hint-guardrails.ts` validates *before* tokens are spent and sanitises *after*:
- Pre-call regex-rejects "full solution", "ignore previous instructions", "system prompt", oversize questions (>280 chars), malformed topic strings.
- System prompt: ≤80 words, ≤1 code fragment of ≤2 lines, never reveal variable names or exact API signatures.
- Post-call: strips fenced code blocks >4 lines, truncates output at 400 chars.
- Endpoint: in-memory rate limit (6 hints / 60s per session).

Tests in `tests/guardrails.test.ts` verify each rule.

---

## Development Approach with AI

| Tool | Model | Purpose |
|---|---|---|
| Claude Code | Opus 4.7 | Codebase scaffolding, schema, guardrail authoring |
| Anthropic API | `claude-sonnet-4-6` | Runtime `/api/hint` and per-attempt summary |
| GitHub Actions | — | Typecheck + Vitest on every PR |

**Agents / roles:**
- *Architect* (Claude Code) — SvelteKit + Drizzle layout, libSQL vs Postgres call, SM-2 over FSRS, HMAC cookie format.
- *Coach* (Sonnet, runtime) — replies to hint questions, bounded by `buildSystemPrompt` in `hint-guardrails.ts`.

**Key prompts:**
1. *"Design a stateless session cookie that proves integrity, expiry, and constant-time PIN compare without a server-side store."* → `<uid>.<exp>.<sig>` + scrypt PIN hash.
2. *"Write a coach system prompt that refuses to write the full solution but still helps a stuck typist."* → `buildSystemPrompt`.
3. *"Pick a spaced-repetition algorithm appropriate for <1k attempts and justify the choice."* → SM-2 over FSRS.

**Key review points and decisions:**
- **Mock the DB in integration tests?** No — in-memory libSQL via `file::memory:?cache=shared` exercises real SQL.
- **Anonymous attempts on the leaderboard?** No — only signed-in users rank; incentive to sign up, no friction for visitors.
- **WPM in the SM-2 quality score?** No — speed is a consequence of accuracy; gating reviews on speed punishes beginners.
- **Post-call sanitiser for jailbroken hints.** Added `sanitizeHint` after a prompt-injection test smuggled a full solution back.
- **Move review state from `attempts` to `topic_mastery`.** Turned "what's due now?" from aggregation to indexed scan.
- **Featured race + per-snippet leaderboard on `/`.** Made multi-user property visible without sign-in.

---

## Installation

```sh
git clone https://github.com/jgyy/codetype-race && cd codetype-race
npm install
cp .env.example .env    # set SESSION_SECRET (≥32 chars) + ANTHROPIC_API_KEY
mkdir -p data && npm run db:push && npm run db:seed
npm run dev             # http://localhost:5173
```

`db:seed` inserts 5 starter snippets and a demo user (handle: `demo`, pin: `123456`).

For prod: set `DATABASE_URL=libsql://...` and `DATABASE_AUTH_TOKEN=...` in Vercel env, then `vercel deploy`.

---

## Usage

- **Race a snippet** (no login): `/` → pick → type → WPM.
- **Sign in:** `/login` → Register (handle 2–24 chars, PIN 4–8 digits).
- **Compete:** `/leaderboard` shows top 50 by best WPM.
- **Review weak topics:** `/profile` lists topics with `next_review_at` due.
- **Hint:** type a conceptual question on a race page. Endpoint refuses anything that smells like "give me the solution".

`POST /api/attempt` returns `{ ok: true, attemptId }`. `POST /api/hint` returns `{ hint }` or 400/429/502 with a reason. All routes work without `ANTHROPIC_API_KEY` except `/api/hint`.

---

## Project Structure

```
codetype-race/
├── src/
│   ├── lib/
│   │   ├── components/Typer.svelte       # typing surface (WPM + accuracy)
│   │   └── server/
│   │       ├── db/{schema,index}.ts      # Drizzle + libSQL
│   │       ├── session.ts                # HMAC cookie + scrypt PIN
│   │       ├── hint-guardrails.ts        # pre/post-call validation
│   │       ├── claude.ts                 # Anthropic wrapper
│   │       └── sm2.ts                    # SuperMemo-2 update
│   └── routes/
│       ├── +page.*                       # snippet picker
│       ├── race/[id]/+page.*             # typing surface + hint UI
│       ├── leaderboard/+page.*           # ranked signed-in users
│       ├── profile/+page.*               # history + due reviews
│       ├── login/+page.*                 # register/login/logout
│       └── api/{attempt,hint}/+server.ts
├── tests/                                # session, sm2, guardrails, integration
├── docs/                                 # B1 spec, ADRs
└── .github/workflows/ci.yml
```

---

## Reflection

**Worked:** Picking libSQL early collapsed the dev/prod surface — one schema, one ORM, identical behaviour. Writing session-security tests *before* route handlers meant the HMAC format survived two revisions without auth-bypass. All guardrails in one file (`hint-guardrails.ts`) make the rubric review a one-page skim.

**Failed / changed:** First pass put `nextReviewAt` on `attempts` — made "what's due now?" an aggregation. Moved to `topic_mastery` for an indexed scan. The hint endpoint originally returned raw Claude output; a prompt-injection test smuggled a full solution, motivating `sanitizeHint`. Considered FSRS for SR and rejected it — rationale now in the README, not buried in commits.

**Not built (deliberately):** No WebSocket multiplayer — *async* is the explicit non-goal-of-realtime choice. No multi-LLM abstraction — Claude only; the only Anthropic-specific call sites are `claude.ts` and the system prompt.

---

## License

MIT — see `LICENSE`.
