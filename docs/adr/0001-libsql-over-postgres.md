# ADR 0001: libSQL/Turso over Postgres

- **Status:** Accepted
- **Date:** 2026-05-16
- **Deciders:** Architect (Claude Code), repo owner

## Context

codetype-race is a B1 Builders Programme submission: a typing-practice app with
signed-in users, an attempts log, a leaderboard, and SM-2 spaced repetition
state per user × topic. Expected scale during the programme is ≤ 1k attempts
per day across the cohort. Deployment target is Vercel Functions.

Reviewers are likely to ask "why not Postgres?" — the default relational choice
on Vercel — so the decision needs a written rationale before the interview.

The choice is between:

1. **Postgres** (via Neon, Supabase, or Vercel Postgres).
2. **libSQL** — SQLite-compatible fork, with [Turso](https://turso.tech) as the
   hosted edge-replicated provider.

## Decision

We use **libSQL** via `@libsql/client`, with **Drizzle ORM** for typed queries
and migrations. In development the client points at a local file
(`./data/codetype.db`); in production it points at a Turso URL with an auth
token. Tests run against in-memory libSQL (`file::memory:?cache=shared`) so
the SQL dialect is identical to dev and prod.

## Rationale

### 1. Zero-ops dev parity — same engine local and in prod

Postgres requires a container, a managed instance, or a fragile local install
even for development. libSQL is a file path in dev and a URL in prod, with no
dialect drift between the two — both speak SQLite. This collapses the
test/dev/prod surface to one schema, one ORM, one set of behaviours.

For a solo programme submission on a tight schedule, that simplicity matters
more than feature breadth.

### 2. Edge-shaped writes via Turso read replicas

Our write pattern is small-and-frequent: one row per race finish, a few rows
per session login. Turso replicates per region over HTTP; this fits Vercel
Functions (where each invocation may open a fresh connection) better than
Postgres' connection-per-Function model, which typically needs a pooler
(PgBouncer, Neon's proxy) to avoid exhausting backends.

We get edge-local reads for the leaderboard "for free" if we later enable
region replicas, without changing application code.

### 3. No need for Postgres-specific extensions

We use no `pg_*` features: no `pg_vector`, no `pg_cron`, no `LISTEN/NOTIFY`,
no `JSONB` operators, no advanced types. Everything we need — foreign keys,
indexes, transactions, `CURRENT_TIMESTAMP` defaults — is in SQLite-class SQL.
Paying the operational cost of Postgres for features we don't use is a poor
trade at this scale.

### 4. SM-2 columns are flat scalars

The SM-2 spaced-repetition algorithm (`src/lib/server/sm2.ts`) stores `ease`,
`interval_days`, `repetitions`, `next_review_at` as plain columns on
`topic_mastery`. No JSON, no arrays, no concurrent writers on the same row
(each user only updates their own row). SQLite's writer-lock semantics are
adequate; Postgres' MVCC is overkill.

## Considered Iteration

An earlier iteration of this repo used **`better-sqlite3`** (synchronous
native binding) before migrating to **`@libsql/client`**. The migration was
driven by two concerns:

- **Vercel Functions are not a native-module-friendly target.** `better-sqlite3`
  needs the right prebuilt binary for the runtime; `@libsql/client` is pure
  JS/HTTP and ships unchanged from local to edge.
- **Turso compatibility.** `@libsql/client` is the client Turso ships; staying
  on it means swapping `DATABASE_URL` from a `file:` URL to a `libsql://` URL
  is the only change needed to move from dev to prod.

> Note: the original migration commit was in a pre-nuke history (the repo was
> reset in `67c76df chore: nuke all files redo project`). The current
> `package.json` reflects the post-migration state — only `@libsql/client` is
> a dependency; `better-sqlite3` is not.

The migration is referenced here as evidence that the libSQL choice was
**arrived at**, not assumed — we tried the simpler synchronous client first
and moved when the deployment target made it untenable.

## Consequences

### Accepted trade-offs

- **No row-level concurrent writers.** SQLite serialises writers. At ≤ 1k
  attempts/day this is invisible; if codetype-race grew to real-time
  multiplayer racing (explicitly a non-goal of this async variant), we would
  revisit.
- **No Postgres extensions.** If we ever wanted `pg_vector` for embedding-based
  topic similarity, we'd need to migrate or run a sidecar.
- **Turso as a single point of dependency.** libSQL itself is open source and
  self-hostable, so the lock-in risk is bounded — we could move to a
  self-hosted libSQL server or back to plain SQLite-on-disk on any host that
  permits persistent storage.

### Migration path if scope grows

If a future requirement breaks one of the assumptions above (concurrent
writers, vector search, multi-tenant isolation at scale), the path forward is:

1. Drizzle already abstracts the dialect — schema definitions move with a
   `drizzle-orm/sqlite-core` → `drizzle-orm/pg-core` swap and column-type
   adjustments (mostly `integer` timestamps → `timestamp`).
2. Data is small and append-mostly; a one-shot dump → load via `drizzle-kit`
   migrations against a fresh Postgres is feasible during a maintenance
   window.
3. The HMAC session cookie, SM-2 logic, and hint guardrails are
   storage-agnostic and need no changes.

The migration is **possible but not free** — we accept that cost in exchange
for the dev/prod simplicity we get today.

## References

- README §[Technology Stack](../../README.md#technology-stack)
- `src/lib/server/db/index.ts` — libSQL client wiring
- `src/lib/server/db/schema.ts` — Drizzle schema
- `drizzle.config.ts` — migration config
- [Turso docs](https://docs.turso.tech/)
- [libSQL repo](https://github.com/tursodatabase/libsql)
