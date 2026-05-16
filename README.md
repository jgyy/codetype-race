# codetype-race

**An async code-typing leaderboard for teams.** Race against curated snippets,
keep persistent stats when you sign in, and let Claude coach you toward weak
topics on a spaced-repetition schedule.

B1 Builders Programme — *team / organisational* project submission.

---

## Overview

### Problem
- **Who is affected?** Students and early-career developers who can read code
  fluently but type it slowly enough that interviews, pair-programming, and
  workshop demos suffer. Existing typing sites (Monkeytype, typeracer) train on
  prose, not on language-aware code.
- **What is the issue?** No shared, async surface where a team (e.g. a 42
  Singapore cluster) can practise *code* typing together, see each other's
  progress, and get AI coaching on the topics each person personally struggles
  with.

### Outcome
- A working async leaderboard with anonymous + signed-in attempts.
- Per-user spaced-repetition queue (SM-2) for weak topics — concrete progression
  signal beyond "raw WPM".
- Claude-powered hints, **strictly bounded by guardrails** so the AI never just
  hands over the answer.
- Stateless HMAC session cookies with unit tests for integrity, constant-time
  PIN compare, and expiry — security claims that are *verified*, not asserted.

---

## Demo

User flow (no recording required to grasp; screenshots TBC):

1. Land on `/` → pick a snippet from the list (language + topic + difficulty).
2. `/race/[id]` shows the target code in a panel; type into the textarea below.
   WPM clock starts on first keystroke; accuracy updates per char.
3. On match-complete, the client POSTs to `/api/attempt` → row inserted, and if
   you're signed in, `topic_mastery` is updated via SM-2.
4. Stuck? "Ask Claude for a hint." Guardrails (see below) reject "give me the
   solution" prompts before any tokens are spent.
5. `/leaderboard` ranks signed-in users by best WPM; `/profile` shows your
   recent attempts and any topics now due for review.

---

## Technology Stack

### Frontend
- **SvelteKit + TypeScript** — routing, server endpoints, UI.
- **Svelte 5 runes** (`$state`, `$derived`) for the typing surface.
- **CodeMirror 6** — wired in `package.json` for the upcoming syntax-highlighted
  typing surface (current MVP uses a controlled textarea).
- **Vite** — dev server + bundler.

### Backend
- **SvelteKit server routes**, deployed as Vercel Functions via
  `@sveltejs/adapter-vercel`.
- **Drizzle ORM over libSQL** — local SQLite file (`./data/codetype.db`) in dev,
  Turso-hosted libSQL in prod. See [§libSQL/Turso rationale](#libsql-vs-postgres).
- **HMAC-signed session cookie** (`<userId>.<expiry>.<sig>`), 30-day TTL,
  constant-time PIN compare via `crypto.timingSafeEqual`, scrypt-hashed PINs.
- **Anthropic Claude API** — `POST /api/hint` gated by `hint-guardrails.ts`,
  per-attempt `ai_summary` column on the `attempts` table.
- **SM-2 spaced repetition** — columns `ease`, `interval_days`, `repetitions`,
  `next_review_at` on `topic_mastery`. See [§spaced-repetition rationale](#spaced-repetition-sm-2).

### libSQL vs Postgres

libSQL was chosen over Postgres for three reasons:

1. **Single binary in dev, single HTTP hop in prod.** Postgres requires a
   container or managed instance even locally; libSQL is a file path in dev and
   a URL in prod, with no dialect drift in between (both speak SQLite).
2. **Edge-shaped writes.** Turso replicates per region; our writes are
   small-and-frequent (one row per race finish), which fits libSQL's HTTP-based
   protocol better than Postgres' connection-per-Function model on Vercel.
3. **B1 scale.** We expect ≤ 1k attempts/day during the programme. Postgres'
   strengths (row-level concurrency, rich type system, extensions) buy us
   nothing at this scale; SQLite-class simplicity wins.

Trade-off accepted: no per-row concurrent writers, no `pg_*` extensions. If the
leaderboard ever needs real-time multiplayer (explicitly a non-goal of this
async variant), we'd revisit.

### Claude prompt guardrails

The threat model for `/api/hint` is:

- Users coercing Claude into emitting the *full snippet* (defeats the practice loop).
- Users free-form chatting with Claude on our API key.
- Prompt injection from inside the snippet body.

The strategy is **two-sided**: validate the request *before* spending tokens,
sanitise the response *after*. Concretely, `src/lib/server/hint-guardrails.ts`:

- Pre-call: regex-rejects "full solution", "ignore previous instructions",
  "system prompt", oversize questions (>280 chars), and malformed topic strings.
- System-prompt contract: ≤80 words, ≤1 code fragment of ≤2 lines, never reveal
  variable names or exact API signatures.
- Post-call: strips fenced code blocks longer than 4 lines, truncates output at
  400 chars.
- Endpoint: in-memory rate limit (6 hints / 60s per session).

Tests in `tests/guardrails.test.ts` verify each rule.

### Spaced repetition (SM-2)

We use **SuperMemo-2** (Wozniak, 1987) rather than newer alternatives (FSRS,
Anki's variants) for one reason: SM-2 needs no per-user training data. With
fewer than 1k attempts across the cohort, FSRS' learned parameters would
over-fit; SM-2's hand-tuned constants are appropriate at this scale.

Mapping is `quality = round(accuracy * 5)`. **WPM intentionally does not feed
quality** — speed is a learned consequence of accuracy, and gating reviews on
speed would punish beginners. The full update lives in `src/lib/server/sm2.ts`
(~20 lines) and is exercised by `tests/sm2.test.ts`.

If we outgrow SM-2 (multi-cohort data, >50k attempts), FSRS is the next stop.

---

## Development Approach with AI

### AI tools, services, models
| Tool | Model | Purpose |
|---|---|---|
| Claude Code (CLI) | Opus 4.7 | Codebase scaffolding, schema design, guardrail authoring |
| Anthropic API | `claude-sonnet-4-6` | Runtime `/api/hint` and per-attempt summary |
| GitHub Actions | — | Typecheck + Vitest on every PR |

### Agents / roles
- **Architect (Claude Code)** — produced the SvelteKit + Drizzle layout, made
  the libSQL vs Postgres call, decided SM-2 over FSRS, designed the HMAC
  cookie format.
- **Coach (Sonnet, runtime)** — replies to user hint questions, bounded by the
  system prompt in `hint-guardrails.ts::buildSystemPrompt`.

### Key prompts
- *"Design a stateless session cookie for a SvelteKit app that proves
  integrity, expiry, and constant-time PIN compare without a server-side
  store."* → produced the `<uid>.<exp>.<sig>` format and the scrypt PIN hash.
- *"Write a coach system prompt that refuses to write the full solution but
  still helps a stuck typist."* → produced the rules in `buildSystemPrompt`.
- *"Pick a spaced-repetition algorithm appropriate for <1k attempts of training
  data and justify the choice."* → SM-2 over FSRS.

### Review points and decisions
- **Should we mock the DB in integration tests?** Decided no — use an in-memory
  libSQL via `file::memory:?cache=shared` so the test exercises the real SQL.
- **Should anonymous attempts appear on the leaderboard?** Decided no — only
  signed-in users rank, which gives a concrete incentive to sign up while
  keeping the practice surface frictionless for visitors.
- **WPM in the SM-2 quality score?** Decided no — see §spaced-repetition.

---

## Installation

```sh
git clone https://github.com/jgyy/codetype-race
cd codetype-race
npm install

cp .env.example .env
# Edit .env: set SESSION_SECRET (>=32 chars) and ANTHROPIC_API_KEY.

mkdir -p data
npm run db:push         # creates ./data/codetype.db with the schema
npm run db:seed         # inserts 5 starter snippets + demo user (handle: demo, pin: 123456)

npm run dev             # http://localhost:5173
```

For Turso/prod: set `DATABASE_URL=libsql://...` and `DATABASE_AUTH_TOKEN=...`
in your Vercel project env, then `vercel deploy`.

---

## Usage

- **Race a snippet** (no login needed): visit `/`, pick a snippet, type it,
  see your WPM.
- **Sign in for stats**: `/login` → "Register" (handle 2–24 chars, PIN 4–8
  digits). Subsequent visits use the same form to sign in.
- **Compete**: `/leaderboard` shows the top 50 by best WPM.
- **Review weak topics**: `/profile` lists any topic whose `next_review_at`
  is now or earlier.
- **Get a hint**: on a race page, type a conceptual question (e.g. "why does
  `this` differ inside an arrow function?") and click *Get hint*. The endpoint
  refuses anything that smells like "give me the solution".

Expected behaviour:
- `POST /api/attempt` returns `{ ok: true, attemptId: <n> }` on success.
- `POST /api/hint` returns `{ hint: "..." }` or a 400/429/502 with a reason.
- All routes work without `ANTHROPIC_API_KEY` *except* `/api/hint`, which 502s.

---

## Project Structure

```
codetype-race/
├── src/
│   ├── app.html, app.d.ts, hooks.server.ts
│   ├── lib/
│   │   ├── components/Typer.svelte         # typing surface (WPM + accuracy)
│   │   └── server/
│   │       ├── db/{schema,index}.ts        # Drizzle schema + libSQL client
│   │       ├── session.ts                  # HMAC cookie + scrypt PIN
│   │       ├── hint-guardrails.ts          # pre/post-call validation
│   │       ├── claude.ts                   # Anthropic SDK wrapper
│   │       └── sm2.ts                      # SuperMemo-2 update
│   └── routes/
│       ├── +layout.{svelte,server.ts}      # nav + user injection
│       ├── +page.{svelte,server.ts}        # snippet picker
│       ├── race/[id]/+page.*               # typing surface + hint UI
│       ├── leaderboard/+page.*             # ranked signed-in users
│       ├── profile/+page.*                 # personal history + due reviews
│       ├── login/+page.*                   # register/login/logout actions
│       └── api/
│           ├── attempt/+server.ts          # writes attempts, updates SM-2
│           └── hint/+server.ts             # Claude with guardrails
├── tests/
│   ├── session.test.ts                     # HMAC, constant-time, expiry
│   ├── sm2.test.ts                         # SM-2 unit tests
│   ├── guardrails.test.ts                  # hint validation
│   └── integration/attempt-leaderboard.test.ts
├── scripts/seed.ts                         # demo data
├── docs/B1-Builders-Programme.md           # programme spec
├── drizzle.config.ts, svelte.config.js, vite.config.ts
└── .github/workflows/ci.yml                # typecheck + tests
```

---

## Reflection

**What worked.**
- Picking libSQL early collapsed the dev/prod surface — one schema file, one
  ORM, identical behaviour. Half a day saved vs. running Postgres locally.
- Writing the session-security tests **before** the route handlers meant the
  HMAC format survived two revisions without any auth-bypass slipping through.
- Putting all guardrails in a single file (`hint-guardrails.ts`) made the
  README's "guardrails" section a one-page link, which is exactly what the
  B1 reviewer needs to skim.

**What failed / changed.**
- First pass tried to put `nextReviewAt` on `attempts` (per-row review state).
  That made "what's due now?" an aggregation. Moving review state to
  `topic_mastery` (one row per user+topic) made it a single indexed scan.
- The hint endpoint originally returned raw Claude output; a teammate's
  prompt-injection test smuggled a full solution back, which led to the
  post-call `sanitizeHint` step (strip long fenced blocks).
- We considered FSRS for spaced repetition and rejected it — the rationale is
  now in the README rather than buried in commits, so future contributors
  don't have to re-derive it.

**Rationale for what we did NOT build.**
- No WebSocket multiplayer — explicitly a non-goal of the *async* variant in
  the epic. Real-time would change the data model (events, not attempts) and
  the cost model (long-lived connections vs Functions).
- No multi-LLM abstraction — Claude only, on-brand for B1. An abstraction
  layer would be premature; the only Anthropic-specific call sites are
  `src/lib/server/claude.ts` and the system prompt.

---

## License

MIT — see `LICENSE`.
