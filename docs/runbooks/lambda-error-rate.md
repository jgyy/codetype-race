# lambda-error-rate

**Severity:** page
**Source:** `(AWS/Lambda Errors / AWS/Lambda Invocations) * 100 > 1` for 5 min

## Meaning
Aggregate Lambda error rate exceeded 1% across all functions in the stack.

## First response
1. Open the **request-flow** dashboard; identify which command/query is failing.
2. `aws logs tail /aws/lambda/Codetype<...> --since 10m --filter-pattern '"level":"error"'` to find the dominant error code.
3. If a recent deploy is suspected, run `gh pr list --state merged --limit 5` and consider rolling back via `cdk deploy --rollback`.
4. If errors are confined to one route, mute by lowering reserved concurrency on the offending handler to `0` (drains traffic, returns 429s) while you investigate.

## Dashboards
- `codetype-request-flow`
- AWS Console → CloudWatch → Logs Insights → saved query "Errors by route"

## Escalation
Page primary; if unresolved in 15 min, page secondary.

## Owner
@jgyy
