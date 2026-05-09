# route-p99-latency

**Severity:** page
**Source:** `app.command.duration_ms{name=<route>}` p99 over budget for 3 consecutive 5-min windows (alarm not yet wired — needs histogram exports from slice-5)

## Meaning
A specific command/query route's p99 latency exceeds its budget. Budgets
are tracked in the spec table at `docs/specs/16-perf-and-cost-hardening.md`.

## First response
1. Identify the route from the alarm dimensions.
2. Open the trace for the slowest current request — dominant span?
3. If DDB span dominates, check `ddb-throttle` and `cost-watch`.
4. If a domain span dominates (e.g. `domain.reduce`), capture an X-Ray flame graph and file a perf ticket.

## Dashboards
- `codetype-request-flow`.
- X-Ray Service Map.

## Escalation
Page primary; secondary if it spans multiple routes.

## Owner
@jgyy
