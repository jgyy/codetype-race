<!-- src/lib/server/: everything that touches secrets, the DB, or Claude.
     Repo-wide rules (commands, style, git etiquette) live in the root AGENTS.md
     and load alongside this — don't repeat them here. This file only adds the
     conventions specific to this directory. -->

# src/lib/server/ — secrets, data, and the Claude call site

Never import anything from this directory into a `.svelte` component or any
client-only file — everything here runs server-side only (DB credentials,
`SESSION_SECRET`, `ANTHROPIC_API_KEY`).

## Files
| File | Owns |
|---|---|
| `session.ts` | HMAC-signed session cookie (`<userId>.<expiryMs>.<sig>`), scrypt PIN hash + constant-time compare |
| `hint-guardrails.ts` | `checkHintRequest` (pre-call) + `sanitizeHint` (post-call) — the gate in front of the only Claude call site |
| `claude.ts` | The one Anthropic call site. No second one — see the "no new LLM providers" rule in the root AGENTS.md |
| `db/schema.ts`, `db/index.ts` | Drizzle schema + libSQL client (snippets, users, attempts, `topic_mastery`) |
| `sm2.ts` | `accuracyToQuality` → SM-2 scheduler. Quality is accuracy-derived, never WPM |
| `rate-limit.ts` | In-memory hint rate limit (6/60s per session) |

## Invariants
- **Session cookies stay stateless**: `<userId>.<expiryMs>.<sig>` HMAC-SHA256 over `SESSION_SECRET`. No server-side session table — that's the whole point.
- **PIN compare is constant-time.** Use `verifyPin` from `session.ts`, never `===` on hashes.
- **SM-2 quality comes from accuracy only** (`sm2.ts::accuracyToQuality`), never WPM. Speed is a *consequence* of accuracy, not an input — using it punishes beginners. Don't "fix" this.
- **Any new Claude call path routes through `checkHintRequest` + `sanitizeHint`.** Adding a guardrail regex is fine; removing one needs a security review.
- **Anonymous attempts are recorded but never ranked** — the leaderboard query joins on `users` deliberately (incentive to sign up, no friction for guests). This lives in `src/routes/leaderboard/+page.server.ts`, not here, but the `users` join is what this directory's schema exists to support.

## Testing
Unit tests live in `tests/<module>.test.ts` (not colocated with source — see the root AGENTS.md). Integration tests exercising this directory's DB code use real SQLite (`file::memory:?cache=shared`), never a mocked `db` — see `tests/integration/`.
