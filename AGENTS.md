# AGENTS.md

Instructions for AI coding agents (Claude Code, Cursor, Copilot, Codex, etc.)
working on `codetype-race`. Read this before making changes. If a rule here
conflicts with a user instruction, follow the user.

## Project at a glance

Async code-typing leaderboard for the B1 Builders programme. SvelteKit +
TypeScript on Vercel Functions, Drizzle over libSQL (local SQLite in dev,
Turso in prod), HMAC-signed session cookies, Anthropic Claude for hints.

See `README.md` for the full architecture and rationale.

## Commands

```sh
npm run dev          # vite dev server on :5173
npm run check        # svelte-check + tsc — must pass before commit
npm test             # vitest (unit + integration) — must pass before commit
npm run db:push      # apply schema to ./data/codetype.db
npm run db:seed      # demo snippets + demo user (handle: demo, pin: 123456)
```

CI runs `check` and `test` on every PR. Don't merge red.

## Layout

- `src/lib/server/` — anything that touches secrets, the DB, or Claude. Never
  import from here in a `.svelte` component or a client-only file.
- `src/lib/components/` — UI primitives. Svelte 5 runes (`$state`, `$derived`,
  `$props`), not Svelte 4 stores.
- `src/routes/` — file-based routing. `+page.server.ts` for loaders/actions,
  `+server.ts` for JSON endpoints.
- `tests/` — Vitest. Unit tests next to module name, integration in
  `tests/integration/`.

## Hard rules

1. **Never widen Claude's output surface in `/api/hint`.** All hint validation
   lives in `src/lib/server/hint-guardrails.ts`. If you add a new prompt path,
   route it through `checkHintRequest` + `sanitizeHint`. Adding regexes is
   fine; *removing* them needs a security review.
2. **Session cookies stay stateless.** Format is `<userId>.<expiryMs>.<sig>`
   signed with HMAC-SHA256 over `SESSION_SECRET`. Don't add a server-side
   session table — the whole point is no DB lookup to verify a cookie.
3. **PIN compare is constant-time.** Use `verifyPin` from `session.ts`. Never
   compare hashes with `===`.
4. **Integration tests use real SQLite, not mocks.** The pattern is
   `file::memory:?cache=shared` (see `tests/integration/`). If a mocked test
   would have caught a bug that a real-DB test wouldn't, write the real-DB
   one.
5. **SM-2 quality comes from accuracy only**, not WPM. See
   `src/lib/server/sm2.ts::accuracyToQuality`. Speed is a *consequence* of
   accuracy; using it as input punishes beginners. Don't "fix" this.
6. **Anonymous attempts are recorded but not ranked.** This is a feature, not
   a bug. The leaderboard query in `src/routes/leaderboard/+page.server.ts`
   joins on `users` for this reason.
7. **No new LLM providers.** Claude only — on-brand for B1. Don't add an
   abstraction layer "for flexibility"; there is exactly one call site
   (`src/lib/server/claude.ts`) and it stays that way.

## Style

- TypeScript strict. No `any`; use `unknown` + narrowing.
- Drizzle queries: prefer `eq`, `and`, `sql` helpers over string templates.
- Svelte 5 runes throughout. No `export let` (Svelte 4) in new code.
- Server endpoints: throw with `error(status, msg)` / `redirect(303, path)`
  from `@sveltejs/kit`, never `return new Response(...)`.
- Don't add comments that restate the code. The existing comments (sparse,
  marked "Why:" or explaining a non-obvious constraint) are the bar.

## What needs tests

Any change to:
- `src/lib/server/session.ts` → extend `tests/session.test.ts`
- `src/lib/server/sm2.ts` → extend `tests/sm2.test.ts`
- `src/lib/server/hint-guardrails.ts` → extend `tests/guardrails.test.ts`
- Schema or attempt/leaderboard SQL → extend `tests/integration/attempt-leaderboard.test.ts`

Tests should fail meaningfully — assert on values, not just "doesn't throw".

## What's intentionally out of scope

- WebSocket multiplayer (this is the *async* variant — non-goal in the epic).
- Mobile native apps.
- Multi-LLM abstraction.
- Server-side anti-cheat on `/api/attempt` timing — flagged in code comments;
  acceptable for a practice leaderboard at B1 scale.

If a user asks for one of these, confirm scope before building.

## Environment

Required env vars (see `.env.example`):

- `SESSION_SECRET` — ≥32 chars. Rotating it invalidates every session cookie.
- `DATABASE_URL` — `file:./data/codetype.db` in dev, `libsql://...` in prod.
- `DATABASE_AUTH_TOKEN` — Turso token; empty in dev.
- `ANTHROPIC_API_KEY` — required for `/api/hint`; the rest of the app runs
  without it.
- `ANTHROPIC_MODEL` — defaults to `claude-sonnet-4-6`.

## Git etiquette

- Don't add `Co-Authored-By` trailers.
- Don't `git add -A`; stage files by name. The repo's `.gitignore` covers
  `data/*.db` and `.env`, but a slip-up is still a slip-up.
- Don't `--no-verify` past a failing hook. Fix the hook's complaint.
