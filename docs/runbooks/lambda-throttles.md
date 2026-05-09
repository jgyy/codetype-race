# lambda-throttles

**Severity:** page
**Source:** `AWS/Lambda Throttles > 0` for 5 min

## Meaning
A Lambda function is being throttled — either it hit reserved concurrency
or the account-level concurrency cap.

## First response
1. Identify the throttled function from the alarm dimensions.
2. Check reserved concurrency vs current invocation rate. If reserved is too low, raise it via `cdk deploy` after editing the limit.
3. Check the account regional concurrency budget (Service Quotas → Lambda) — if approaching, request an increase.

## Dashboards
- AWS Console → Lambda → function → Monitor tab.

## Escalation
Self-resolve unless concurrency is account-wide; then page platform owner.

## Owner
@jgyy
