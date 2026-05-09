# stream-iterator-age

**Severity:** page
**Source:** `AWS/Lambda IteratorAge` (broadcaster/stream functions) > 60s for 5 min

## Meaning
The DDB Stream consumer is falling behind. Players see stale broadcasts
or no broadcasts at all.

## First response
1. Identify which stream lambda is lagging from alarm dimensions.
2. Tail logs; look for retry storms, throttling, or per-record failures.
3. Check downstream WS API health — if `postToConnection` is failing for
   stale connections, the broadcaster may be retrying excessively.
4. As a load-shed, scale Lambda reserved concurrency UP for the
   broadcaster (more parallel shard readers).

## Dashboards
- `codetype-ws-infra`.

## Escalation
Page primary immediately. Stalled streams compound fast.

## Owner
@jgyy
