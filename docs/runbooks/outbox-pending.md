# outbox-pending

**Severity:** page
**Source:** `app.outbox.pending` gauge > 1000 for 5 min (alarm not yet wired — Phase 14 outbox publisher needs gauge emit)

## Meaning
Phase 14's outbox depth is growing — events are being appended faster
than the publisher drains them. Downstream projections fall behind.

## First response
1. Tail `outbox-publisher` logs for retry/backoff loops.
2. Check the broadcaster lambda's iterator age (related runbook).
3. If a known dependency (e.g. SES, third-party API) is degraded, pause the corresponding outbox publisher to keep the queue from growing further.

## Dashboards
- `codetype-request-flow` → Outbox depth widget (added when gauge ships).

## Escalation
Page primary; if depth keeps climbing, secondary.

## Owner
@jgyy
