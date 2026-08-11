# Failure Scenarios

## Scenario: Slow notification-worker consumer (backlog buildup)

**Component:** `notification-worker`
**Trigger:** `WORKER_DELAY_MODE` environment variable

### What it simulates

`incident-report-service` publishes every new report to the
`incident-notifications` RabbitMQ queue (fire-and-forget — it does not wait
for the worker to process the message before responding to the client).
`notification-worker` consumes that queue one message at a time and
simulates the work of sending a notification about the incident.

Setting `WORKER_DELAY_MODE=true` simulates a worker that has fallen behind —
for example because a downstream notification provider (SMS/push gateway) has
become slow — by stretching per-message processing time from a fixed 200ms to
4–8 seconds. Because RabbitMQ delivers one message at a time
(`channel.prefetch(1)`), the queue depth grows any time reports arrive faster
than the worker can drain them.

### How to trigger it

```bash
# Start (or restart) the worker with delay mode enabled
WORKER_DELAY_MODE=true docker compose up -d notification-worker
```

### How to observe it

Poll the worker's health endpoint — `queueDepth` is the number of
undelivered/unacked messages still sitting in RabbitMQ, and `processedCount`
is how many the worker has finished since it started:

```bash
curl http://localhost:3003/health
```

You can also watch the queue directly in the RabbitMQ management UI at
[http://localhost:15672](http://localhost:15672) (user/pass: `alerts`/`alerts`),
under Queues → `incident-notifications`.

### What we actually observed

With delay mode enabled, submitting 10 incident reports back-to-back through
the ambassador produced a clearly growing backlog that drained at roughly one
message per 5–6 seconds:

| Time | queueDepth | processedCount |
|---|---|---|
| t+0s (right after burst) | 9 | 0 |
| t+5s | 7 | 2 |
| t+10s | 6 | 3 |
| t+15s | 5 | 4 |
| t+20s | 4 | 5 |

Restarting the worker without `WORKER_DELAY_MODE` (or setting it back to
`false`) let it drain the remaining backlog almost immediately — the
remaining messages were processed in well under a second once normal 200ms
processing time resumed.

Throughout this scenario, `incident-report-service` itself kept responding
immediately (its SLO in `docs/SLO.md` is about the HTTP request/response, not
about how quickly a report is later processed by the worker) — submissions
never failed or slowed down because publishing to RabbitMQ is fire-and-forget.
The backlog is a purely internal, asynchronous problem: reports are recorded
correctly and never lost (RabbitMQ persists them, and messages are only acked
after successful processing), but downstream notifications are delayed.

### How to recover

```bash
# Disable delay mode and let the worker catch up
docker compose up -d notification-worker
```

If the backlog needs to drain faster than one worker can manage, running
multiple `notification-worker` replicas consuming the same queue (similar to
how `official-alert-a`/`official-alert-b` share load behind Caddy) would let
RabbitMQ round-robin messages across workers instead of scaling processing
speed on a single instance.

### Why this matters

A growing `incident-notifications` queue is a leading indicator of a problem
that wouldn't show up in `incident-report-service`'s own request-latency
metrics at all — the HTTP-facing SLO can look perfectly healthy while
residents are actually waiting minutes for a notification about their
report. This is why `queueDepth` is exposed on the worker's `/health`
endpoint: it's the signal an on-call engineer or monitoring system would
need to catch this class of failure before it's visible anywhere else.
