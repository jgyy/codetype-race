# cost-watch-ddb-reads

**Severity:** warn
**Source:** `AWS/DynamoDB ConsumedReadCapacityUnits` (Sum, daily) up >50% vs same day last week (CloudWatch metric-math: `(today - LAG(metric, 7d)) / LAG(metric, 7d) > 0.5`).

## Meaning
DDB read consumption has grown by more than half compared to the same day a week ago. At PAY_PER_REQUEST billing, this is a direct cost spike.

## First response
1. Open the **cost-watch** dashboard. Compare today vs last week's read-units chart.
2. Run `aws logs insights` queries to find the top route-by-DDB-reads in the same window.
3. Check whether a known event explains the spike (tournament finale, marketing push, post-mortem retro). Annotate the dashboard if so and silence this alarm via tagging.
4. If unexplained, inspect recent deploys: `git log --since="8 days ago" -- lambdas/src/repos`. A new repo method that does N+1 queries is the usual culprit.
5. Slice 16.1 sharded reads can amplify reads for cold leaderboards — verify `LEADERBOARD_SHARDED_LANGS` env didn't expand beyond a tested set.

## Dashboards
- `codetype-cost-watch` (daily DDB units, side-by-side)
- AWS Console → CloudWatch → Metrics → AWS/DynamoDB → Table.codetype

## Escalation
Warn-level only — no page. If sustained for 3 days and unexplained, escalate to product to validate traffic growth.

## Owner
@jgyy
