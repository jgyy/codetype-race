# cost-watch-lambda-duration

**Severity:** warn
**Source:** `AWS/Lambda Duration` (Sum, daily) up >50% vs same day last week. GB-seconds = Duration × MemorySize / 1024 / 1000; sum-Duration is the correct cost proxy at fixed memory.

## Meaning
Aggregate Lambda runtime has grown >50% week-over-week. Either invocation count is up (overlap with cost-watch-apigw-requests) or per-invocation duration is up (regression in a hot handler).

## First response
1. Open the **cost-watch** dashboard. If invocations also up proportionally → it's traffic, annotate.
2. If invocations are flat but duration is up → look for a per-handler regression. Group by FunctionName in the AWS console.
3. Slice 16.2 SnapStart should *reduce* cold-start duration; if you flipped the flag off, expect a one-time bump.
4. Slice 16.6 `queryGsiThenHydrate` adds a BatchGet round-trip per Query — when `gsi1KeysOnly=true` flips on, expect a small uniform bump across read paths. Compare against the deploy timestamp.

## Dashboards
- `codetype-cost-watch`
- `codetype-request-flow` (per-route duration p95)

## Escalation
Warn-level. Sustained → product.

## Owner
@jgyy
