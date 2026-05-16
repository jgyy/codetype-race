# AGENTS.md — codetype-race

Companion to [`README.md`](./README.md). The AWS backend was removed on 2026-05-16; this file now reflects the frontend-only repo.

## Workspaces

- `@codetype/shared` — pure TS utilities (WPM, Elo, anticheat, Zod schemas).
- `@codetype/domain` — domain models.
- `@codetype/app` — application logic.
- `@codetype/web` — Next.js 16 client.

## Operating rules for AI agents

1. External input is **Zod-validated** — schema in `shared/src/schemas/` first, then consumer.
2. Tests are colocated (`*.test.ts`) and run via `bun --filter '*' test`.
3. Run `bun run check` (deps + fonts) before declaring work done.
4. No AWS SDK imports — the backend is gone. Don't reintroduce `@aws-sdk/*` or CDK without an explicit ask.
