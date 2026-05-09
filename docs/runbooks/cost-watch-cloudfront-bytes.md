# cost-watch-cloudfront-bytes

**Severity:** warn
**Source:** `AWS/CloudFront BytesDownloaded` (Sum, daily) up >50% vs same day last week.

## Meaning
CDN egress has grown >50% week-over-week. CloudFront is per-GB billed; a hotspot like a viral share or a misbehaving client polling a large asset shows up here first.

## First response
1. Open the **cost-watch** dashboard.
2. AWS Console → CloudFront → Reports → Top URLs. Identify the heavy paths.
3. Slice 16.13 service worker precaches ~600 kB on every install — a flood of fresh installs (e.g. SW killswitch flip) can spike CDN bytes.
4. Slice 16.8 bundle budget is 180 kB gzip per route — confirm the bundle hasn't crept past it. The CI check should prevent this.
5. If a third party is hot-linking, consider tightening CORS/Referer at the CloudFront level.

## Dashboards
- `codetype-cost-watch`

## Escalation
Warn-level. Sustained → product.

## Owner
@jgyy
