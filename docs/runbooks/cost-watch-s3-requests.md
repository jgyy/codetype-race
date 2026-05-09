# cost-watch-s3-requests

**Severity:** warn
**Source:** `AWS/S3 GetRequests + PutRequests` (Sum, daily) up >50% vs same day last week.

## Meaning
S3 request count has grown >50% week-over-week. Both the site bucket (CDN origin) and the replays bucket contribute; check which.

## First response
1. Open the **cost-watch** dashboard.
2. AWS Console → S3 → Metrics → split by BucketName. The site bucket's GETs should be near-zero in steady state (CloudFront caches everything); a spike there points at a CDN config regression — confirm slice 16.14's CACHING_OPTIMIZED is still applied.
3. The Replays bucket's PUTs scale with race finishes; check `app.commands.total{name=FinishRaceCommand}` in the request-flow dashboard for proportional growth.
4. Lifecycle rules on the Replays bucket auto-expire after 90 days; that's not in the request count but storage cost — separate signal.

## Dashboards
- `codetype-cost-watch`

## Escalation
Warn-level. Sustained → product.

## Owner
@jgyy
