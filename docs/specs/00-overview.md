# Specs Overview

This directory contains per-phase specifications for the codetype-race feature & refactor roadmap. Each spec is independently executable.

## Phase index

| # | Spec | Scope |
|---|---|---|
| 02 | [02-workspaces-and-xstate.md](./02-workspaces-and-xstate.md) | Bun workspaces migration + XState install |
| 03 | [03-backend-refactors.md](./03-backend-refactors.md) | Zod schemas, middleware, repository pattern |
| 04 | [04-frontend-fsm.md](./04-frontend-fsm.md) | RoomClient → XState machine refactor |
| 05 | [05-quick-wins.md](./05-quick-wins.md) | B1 spectator, B2 practice, B3 filters, B6 rematch |
| 06 | [06-identity-engagement.md](./06-identity-engagement.md) | B4 profiles+Elo, B7 chat, B8 daily |
| 07 | [07-power-features.md](./07-power-features.md) | B5 replay, B9 community snippets, B10 anti-cheat |
| 08 | [08-polish-and-ci.md](./08-polish-and-ci.md) | CI, Playwright E2E, CloudWatch dashboard |

## Conventions

- **File paths** are absolute from repo root.
- **Code blocks** show *target* signatures, not necessarily final implementation.
- **Acceptance criteria** are the PR merge checklist for that phase.
- **Test plan** lists the minimum tests required before merge.
- A spec is **done** when all acceptance criteria pass and CI is green.

## Cross-cutting decisions (locked)

- Package manager: **Bun workspaces** (decision reversed from original "no workspaces" stance — see Phase 02).
- Frontend state: **XState v5** + `@xstate/react`.
- Validation: **Zod** in `@codetype/shared/schemas`, used by both lambdas and web.
- Lambda bundling: **`aws-cdk-lib/aws-lambda-nodejs` NodejsFunction** (esbuild). Workspace deps inlined.
- Replay storage: **S3**, not DynamoDB.
- Anti-cheat: **flag, never auto-ban**.
