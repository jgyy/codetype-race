# codetype-race

Multiplayer typing race for code snippets. Frontend only — the AWS backend (CDK, Lambdas, DynamoDB, API Gateway, Cognito, CloudFront) was decommissioned on 2026-05-16, and `race.codephase.dev` is no longer served.

This repo now contains the Next.js client and supporting TypeScript packages. The original AWS-deployed version is preserved in git history; phase-by-phase specs live under `docs/specs/done/`.

## Repo layout

```
codetype-race/
├── shared/   @codetype/shared   pure TS: wpm, elo, anticheat, schemas
├── domain/   @codetype/domain   domain models
├── app/      @codetype/app      application logic
├── web/      @codetype/web      Next.js 16 app
├── data/                        seed snippet JSON
├── scripts/                     dep-check, loc
└── docs/specs/done/             historical phase specs
```

## Develop

```bash
bun install
bun --filter @codetype/web dev      # http://localhost:3000
bun --filter '*' test
bun run check                       # check:deps + check:fonts
```

## License

Apache 2.0 — see `LICENSE`.
