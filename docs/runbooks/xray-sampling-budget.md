# xray-sampling-budget

**Severity:** warn
**Source:** Approaching 80% of the X-Ray free-tier monthly quota (alarm not yet wired — exporters land in slice-5)

## Meaning
We're about to leave the free X-Ray tier. Cost is small but we should
catch this consciously.

## First response
1. Confirm there isn't a runaway always_on sampler — the spec budget assumes 5% normal + 100% errors.
2. If a recent deploy raised sampling, lower it via `OTEL_TRACES_SAMPLER` env var (no redeploy needed if read at runtime).
3. If traffic genuinely doubled, raise the X-Ray cost line item in the next planning review.

## Dashboards
- `codetype-cost-watch`.
- AWS Cost Explorer → service = X-Ray.

## Escalation
None — warn-level only.

## Owner
@jgyy
