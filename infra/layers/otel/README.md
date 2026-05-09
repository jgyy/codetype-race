# OTel Lambda Layer

Phase 15 / slice-1 scaffold. Attached to every `NodejsFunction` by
`infra/lib/codetype-stack.ts`. The layer preloads `bootstrap.js` via
`NODE_OPTIONS=--require /opt/otel/bootstrap.js` so SDK init runs before any
handler module evaluates (the only way to capture the cold-start span when
later slices flip sampling on).

## Current state (slice-1)

- `OTEL_TRACES_SAMPLER=always_off` is set on every function — SDK is hot but
  emits nothing.
- No exporters are wired. Slice-3 adds the OTLP/X-Ray exporter.
- Auto-instrumentations: AWS SDK + http only. fs/dns/net disabled.

## Building

CDK builds the layer asset by running `bun install --production` inside this
directory at synth time. Pinned versions live in `package.json`. To bump:

```bash
cd infra/layers/otel
bun install   # update lockfile
git add bun.lock package.json
```

## Disabling

Set `OTEL_DISABLED=1` on a function (handled in slice-2 once we read the
flag), or detach the layer in `codetype-stack.ts` and redeploy. The handlers
have no hard dependency on the layer being present.
