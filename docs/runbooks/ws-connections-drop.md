# ws-connections-drop

**Severity:** warn
**Source:** WS connection count drops >30% in 1 min (alarm not yet wired — needs gauge from slice-5)

## Meaning
Sudden drop in active WS connections. Likely an APIGW-WS infra blip;
occasionally an authorizer regression.

## First response
1. Verify AWS Health Dashboard for ApiGateway WS in our region.
2. Check authorizer Lambda error rate — a broken JWT verifier cascades into mass disconnects.
3. If healthy, file an investigation ticket — clients reconnect automatically via Phase 14 catch-up.

## Dashboards
- `codetype-ws-infra`.

## Escalation
None — warn-level. Monitor for a follow-up `lambda-error-rate` page.

## Owner
@jgyy
