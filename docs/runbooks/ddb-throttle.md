# ddb-throttle

**Severity:** page
**Source:** `AWS/DynamoDB UserErrors > 0` for 5 min

## Meaning
DynamoDB rejected a request — most often a `ProvisionedThroughputExceeded`
on the leaderboard partition or a hot tournament partition.

## First response
1. Open `codetype-cost-watch`; check Consumed RCU/WCU per table.
2. If a single partition is hot, consider enabling Phase 16 leaderboard
   sharding (per-language flag).
3. If WCU spike correlates with a tournament finishing, this is expected
   load — verify auto-scaling actually scaled (PAY_PER_REQUEST should
   absorb it; if it didn't, file a support ticket).

## Dashboards
- `codetype-cost-watch`.
- AWS Console → DynamoDB → table → Monitoring.

## Escalation
Page primary; secondary if unresolved in 15 min.

## Owner
@jgyy
