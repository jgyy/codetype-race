# codetype-race

Real-time multiplayer typing race for code snippets. A host creates a room, shares a 6-character join code, 2–8 players join a lobby, everyone races the same snippet at the same time, and a podium shows the winner with WPM/accuracy.

See `docs/01codetype-race-plan.md` for the full plan.

## Repo layout

Three independent packages — no Bun workspaces. `shared/src/*.ts` is copied into `lambdas/src/shared/` and `web/src/shared/` (run `bun run sync-shared` in either package after editing `shared/`).

```
shared/    pure TS — wpm.ts, streak.ts, ddb-keys.ts, types.ts (+ tests)
lambdas/   AWS Lambda handlers (http/, ws/, stream/)
infra/     AWS CDK stack (DynamoDB, Cognito, API GW HTTP+WS, S3+CloudFront)
web/       Next.js 16 app (static export → S3+CloudFront)
data/      Seed snippet JSON
scripts/   Bun scripts (seed)
```

## Local dev

```bash
# Run shared tests
cd shared && bun install && bun test

# Deploy infra (uses AWS_PROFILE=your_profile)
cd infra && bun install && bunx cdk deploy --profile your_profile

# Seed snippets after first deploy
AWS_PROFILE=your_profile TABLE_NAME=codetype bun scripts/seed-snippets.ts

# Run web app locally — set NEXT_PUBLIC_* from CDK outputs
cd web && bun install && bun run dev
```

## Environment variables (web)

| Var | Source |
|---|---|
| `NEXT_PUBLIC_HTTP_API` | CDK output `HttpApiUrl` |
| `NEXT_PUBLIC_WS_API` | CDK output `WsApiUrl` |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | CDK output `UserPoolId` |
| `NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID` | CDK output `UserPoolClientId` |
| `NEXT_PUBLIC_COGNITO_REGION` | e.g. `ap-southeast-1` |

## Deploy from CI

`.github/workflows/deploy.yml` assumes a role via OIDC (`secrets.AWS_DEPLOY_ROLE_ARN`), runs `cdk deploy`, then syncs `web/out` to the S3 bucket.
