# route-error-rate

**Severity:** page
**Source:** `app.commands.total{outcome=error} / app.commands.total > 1%` for 5 min (alarm not yet wired — needs counter exports from slice-5)

## Meaning
A single command/query route's error rate exceeds 1%. Narrower than the
account-wide `lambda-error-rate`.

## First response
1. From the alarm, note the route name; pull `app.commands.total{name=<route>,outcome=error}`.
2. Logs Insights → filter by `bus=<route> AND ok=false` → group by `code`.
3. If `code` is dominated by a validation/auth error, this is likely a client regression — coordinate with web team.
4. If `code` is `Internal`, follow the lambda-error-rate path.

## Dashboards
- `codetype-request-flow`.

## Escalation
Page primary; secondary if multiple routes.

## Owner
@jgyy
