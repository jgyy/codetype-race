# cost-watch-ddb-writes

**Severity:** warn
**Source:** `AWS/DynamoDB ConsumedWriteCapacityUnits` (Sum, daily) up >50% vs same day last week.

## Meaning
DDB write consumption has grown more than 50% week-over-week. Writes are ~5× the cost of reads on PAY_PER_REQUEST, so this is the more expensive direction to overshoot.

## First response
1. Open the **cost-watch** dashboard. Compare today vs last week's write-units chart.
2. Slice 16.1's dual-write doubled per-race write count to leaderboard rows. If the spike correlates with a recent rollout, that's the expected baseline shift.
3. Check the outbox publisher and stream consumers — a retry storm shows up as elevated writes too.
4. Inspect TransactWrite items per race; slice 16.1 raised the per-participant items from 6 to 10. A room with >9 racers can fail-loop if introduced.

## Dashboards
- `codetype-cost-watch`

## Escalation
Warn-level. Sustained 3+ days unexplained → escalate to product.

## Owner
@jgyy
