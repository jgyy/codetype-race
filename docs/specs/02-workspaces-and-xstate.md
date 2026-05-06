# Phase 02 — Bun Workspaces + XState

## Goal

Eliminate the `sync-shared` copy step by promoting `shared/` to a real workspace package `@codetype/shared`, consumed by `lambdas`, `web`, and `infra`. Install XState ahead of the FSM refactor in Phase 04.

## Motivation

- `shared/src/*.ts` is currently duplicated into `lambdas/src/shared/` and `web/src/shared/` via a manual `sync-shared` script. Drift is silent and review diffs are tripled.
- A real workspace gives us a single source of truth, type-safe imports, and zero-cost consumption (esbuild inlines workspace deps at bundle time).

## Scope

### In
- Convert repo to Bun workspaces.
- Rename packages to scoped names (`@codetype/*`).
- Replace all `../shared/...` and `./shared/...` imports with `@codetype/shared/...`.
- Delete duplicated `shared/` directories inside `lambdas/` and `web/`.
- Delete `sync-shared` scripts and references.
- Install `xstate` and `@xstate/react` in `web/`.
- Verify Lambda bundling still inlines shared code.

### Out
- No FSM refactor (that's Phase 04).
- No new features.
- No DDB schema changes.

## File changes

### Root `package.json`
```json
{
  "name": "codetype-race",
  "private": true,
  "workspaces": ["shared", "lambdas", "web", "infra"],
  "scripts": {
    "dev": "bun --filter @codetype/web dev",
    "build": "bun --filter @codetype/web build",
    "test": "bun --filter '*' test",
    "cdk": "bun --filter @codetype/infra exec cdk",
    "seed": "bun scripts/seed-snippets.ts"
  }
}
```

### `shared/package.json`
```json
{
  "name": "@codetype/shared",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    "./wpm": "./src/wpm.ts",
    "./streak": "./src/streak.ts",
    "./ddb-keys": "./src/ddb-keys.ts",
    "./types": "./src/types.ts"
  }
}
```

### `lambdas/package.json` & `web/package.json`
Add to `dependencies`:
```json
"@codetype/shared": "workspace:*"
```

### `web/package.json` — additionally add
```json
"xstate": "^5.x",
"@xstate/react": "^5.x"
```

### `web/next.config.ts`
```ts
const nextConfig = {
  // ...existing
  transpilePackages: ['@codetype/shared'],
};
```

### Imports — find/replace across the repo
- `from '../shared/wpm'` → `from '@codetype/shared/wpm'`
- `from './shared/types'` → `from '@codetype/shared/types'`
- (etc. for `streak`, `ddb-keys`)

### Deletions
- `lambdas/src/shared/` (entire directory)
- `web/src/shared/` (entire directory)
- `web/scripts/sync-shared.*` if present
- `"sync-shared"` script entries in three `package.json` files

### CDK confirmation
- `infra/lib/*.ts`: Lambda functions must use `aws-cdk-lib/aws-lambda-nodejs.NodejsFunction` (esbuild bundling). If any use `lambda.Function` with a directory-based asset, switch them.

## Acceptance criteria

- [ ] `bun install` from root succeeds; `node_modules/@codetype/shared` is a symlink.
- [ ] No `lambdas/src/shared/` or `web/src/shared/` directories remain.
- [ ] No file references `sync-shared`.
- [ ] `bun run --filter @codetype/shared test` passes.
- [ ] `bun run --filter @codetype/web build` succeeds.
- [ ] `bun run --filter @codetype/infra exec cdk synth` succeeds.
- [ ] Lambda bundle output (e.g. `cdk.out/.../*.js`) contains inlined shared code (grep for known shared symbols, e.g. `computeWpm`).
- [ ] `xstate` and `@xstate/react` resolvable in `web` (e.g. `bun run --filter @codetype/web exec node -e "require.resolve('xstate')"`).

## Test plan

- Run all existing test suites; behavior must be unchanged.
- Manual smoke: `bun run --filter @codetype/web dev`, host a room, join from another tab, run a race to finish.

## Risks / mitigations

- **Risk:** CDK `NodejsFunction` doesn't follow the workspace symlink for `@codetype/shared` and tries to install it from npm.
  - **Mitigation:** ensure esbuild `bundling: { externalModules: [] }` or default; verify by inspecting one bundle output before merging.
- **Risk:** Next.js dev server fails to resolve `@codetype/shared` without `transpilePackages`.
  - **Mitigation:** added in `next.config.ts` above.
- **Risk:** Tests in `lambdas/tests` import the local copy; update import paths.

## Rollback

Single commit; revert if anything in the acceptance checklist fails.

## Estimate

½ day.
