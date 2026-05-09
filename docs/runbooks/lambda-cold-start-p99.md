# lambda-cold-start-p99

**Severity:** warn
**Source:** Cold-start p99 > 1.5s for 10 min (alarm not yet wired — needs cold-start metric emitter from slice-5)

## Meaning
Cold-start tail latency regressed past the SLO. Frequently caused by
bundle-size growth, layer churn, or new heavy module-init code.

## First response
1. Compare bundle sizes against last week (CI artifact).
2. Check whether the OTel layer was redeployed recently (`cdk diff CodetypeStack` against last-good).
3. If SnapStart is enabled (Phase 16), confirm the snapshot is current.

## Dashboards
- `codetype-request-flow` → cold-start p99 widget (added when alarm goes live).

## Escalation
None — warn-level only. File a perf ticket if it persists for >24h.

## Owner
@jgyy
