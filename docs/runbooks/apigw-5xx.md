# apigw-5xx

**Severity:** page
**Source:** `AWS/ApiGateway 5XXError > 0.5%` for 10 min

## Meaning
API Gateway is returning 5xx faster than the budget. Either the upstream
Lambda is failing/timing out, or the gateway integration itself is broken
(rare — usually IAM or VPC misconfig).

## First response
1. Cross-check against `lambda-error-rate`. If both fire, the root cause is downstream — follow the lambda runbook.
2. If only `apigw-5xx` fires, suspect integration / authorizer. Tail `aws logs tail /aws/apigateway/...`.
3. Verify the JWT authorizer JWKS endpoint is reachable from APIGW (Cognito user-pool URL).

## Dashboards
- `codetype-request-flow`
- AWS Console → API Gateway → stage → Logs/Tracing.

## Escalation
Page primary; secondary if unresolved in 15 min.

## Owner
@jgyy
