# Specs Overview

This directory contains per-phase specifications. Each spec is independently executable. Completed phases (02–08) live under `./done/`. Phases 09+ below are the next-up roadmap covering new features and design-pattern improvements.

## Pending phase index

| # | Spec | Scope | Class |
|---|---|---|---|
| 09 | [09-tournaments-and-seasons.md](./09-tournaments-and-seasons.md) | Bracketed tournaments + seasonal Elo decay | Feature |
| 10 | [10-teams-guilds-social.md](./10-teams-guilds-social.md) | Friends graph, guilds, presence, team races | Feature |
| 11 | [11-achievements-quests-xp.md](./11-achievements-quests-xp.md) | XP/levels, achievement engine, daily/weekly quests | Feature |
| 12 | [12-pwa-mobile-a11y.md](./12-pwa-mobile-a11y.md) | PWA + service worker, mobile race UI, WCAG AA | Feature |
| 13 | [13-hexagonal-cqrs.md](./13-hexagonal-cqrs.md) | Domain/app/adapters split + command/query buses | Pattern |
| 14 | [14-event-sourcing.md](./14-event-sourcing.md) | Append-only race event log + transactional outbox | Pattern |
| 15 | [15-observability-otel.md](./15-observability-otel.md) | OpenTelemetry traces/metrics/logs end-to-end | Pattern |
| 16 | [16-perf-and-cost-hardening.md](./16-perf-and-cost-hardening.md) | Latency, bundle size, DDB sharding, CloudFront tuning | Pattern |

## Recommended ordering

Pattern phases unblock feature phases. Suggested merge order:

```
13 (Hexagonal/CQRS)
   └─► 14 (Event Sourcing)        ── unlocks ──► 11 (Achievements via event log)
   └─► 15 (Observability)         ── unlocks ──► 16 (Perf, measurement-driven)

09 (Tournaments)   ⟂   10 (Social)   ⟂   12 (PWA/a11y)     # parallel, only loose coupling to patterns
```

- **13 first** — every later spec assumes the bus + ports/adapters layout.
- **14 before 11** — Phase 11 progression is event-sourced; landing 14 first removes a temporary dual-write bridge.
- **15 before 16** — you can't tune what you can't measure.
- **09 / 10 / 12** — feature phases with their own DDB partitions and routes; can ship in any order.

## Conventions (unchanged from earlier phases)

- **File paths** are absolute from repo root.
- **Code blocks** show *target* signatures, not necessarily final implementation.
- **Acceptance criteria** are the PR merge checklist for that phase.
- **Test plan** lists the minimum tests required before merge.
- A spec is **done** when all acceptance criteria pass and CI is green; on completion, `mv docs/specs/NN-*.md docs/specs/done/`.

## Cross-cutting decisions (locked, applied across 09–16)

- Single-table DynamoDB stays. New entities are key-prefixed; **at most one** new GSI across all 8 specs (currently zero added — every new access pattern reuses GSI1).
- Zod schemas in `@codetype/shared/schemas` are still the canonical wire-type source.
- Lambda bundling stays `aws-cdk-lib/aws-lambda-nodejs.NodejsFunction` (esbuild). No container images.
- Single region (ap-southeast-1).
- "Flag, never auto-ban" extends to all enforcement: every user-visible action that limits another user goes through a moderator queue (Phase 09 tournaments, Phase 10 guilds, Phase 11 anti-abuse).
- Cognito-only identity. No social login adapters.
- All new mutating endpoints accept and require an `Idempotency-Key` (UUID) header once Phase 14 lands.
- All new endpoints honour the OTel context once Phase 15 lands; until then, `traceparent` is optional.
