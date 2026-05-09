# cost-watch-apigw-requests

**Severity:** warn
**Source:** `AWS/ApiGateway Count` (Sum, daily) up >50% vs same day last week.

## Meaning
HTTP API request volume has grown >50% week-over-week. This is the leading indicator — it tends to precede Lambda Duration and DDB consumption spikes.

## First response
1. Open the **cost-watch** dashboard. Confirm the magnitude.
2. AWS Console → API Gateway → Stages → request count by route. The split tells you if it's organic growth (broad) or a hotspot (one route).
3. Check slice 16.15 Cache-Control: a regression that drops `s-maxage` would cause CDN cache misses to multiply origin traffic.
4. Look for crawlers / scrapers via CloudWatch Logs: high `route=GET /leaderboard` with no JWT claim is suspicious.

## Dashboards
- `codetype-cost-watch`

## Escalation
Warn-level. Sustained → product.

## Owner
@jgyy
