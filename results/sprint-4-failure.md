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
immediately (its SLO in [`docs/SLO.md`](../docs/SLO.md) is about the HTTP
request/response, not about how quickly a report is later processed by the
worker) — submissions never failed or slowed down because publishing to
RabbitMQ is fire-and-forget. The backlog is a purely internal, asynchronous
problem: under normal operation reports are recorded and eventually
processed, but downstream notifications are delayed. This is *not* a
delivery guarantee, though — see the caveats below.

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

### What a real production system would do differently

This project's RabbitMQ setup is a simplified simulation, and it has real
gaps that a production system would need to close:

- **Publisher confirmations.** `incident-report-service` calls
  `channel.sendToQueue()` and moves on without waiting for RabbitMQ to
  confirm the message was actually received and written to disk. If the
  broker connection drops or the broker itself is restarting at exactly the
  wrong moment, that message can silently disappear. A production publisher
  would enable [confirm channels](https://www.rabbitmq.com/docs/confirms)
  and only treat a report as "notified" after the broker acks the publish,
  retrying or alerting on nacks/timeouts instead of assuming success.
- **Retries and dead-letter queues.** The current worker either processes a
  message successfully or (on a thrown error) `nack`s it with no requeue,
  which just drops it. There's no retry-with-backoff and no dead-letter
  queue to catch messages that repeatedly fail, so a bug in notification
  processing (or a malformed message) can lose data with no trace. A real
  system would configure a DLQ (`x-dead-letter-exchange`) plus a bounded
  number of retries, so failures are quarantined and visible instead of
  silently discarded.
- **Persistent RabbitMQ storage / clustering.** `docker-compose.yml` runs a
  single `rabbitmq:3-management` container with no volume mounted for
  `/var/lib/rabbitmq`, so a container restart or image rebuild wipes every
  queued message — durable queues only protect against the broker process
  restarting cleanly, not against losing the container's filesystem
  entirely. Production RabbitMQ would run as a clustered deployment (e.g.
  3 nodes with quorum queues) backed by persistent volumes, so the queue
  survives both individual node failures and routine redeploys.
- **Monitoring and alerting.** Right now, catching a backlog requires
  manually polling `/health` or opening the RabbitMQ management UI. A
  production system would scrape `queueDepth` (and RabbitMQ's own metrics)
  into a time-series system and alert when depth or age-of-oldest-message
  crosses a threshold, rather than relying on someone noticing.
- **Automatic worker scaling.** This project only demonstrates the *idea*
  of running multiple consumers (mentioned above) — nothing here actually
  scales `notification-worker` automatically. A production system would
  scale worker replica count based on `queueDepth`/consumer lag (e.g. via a
  Kubernetes HPA on a custom metric) so backlogs like the one in this
  scenario resolve themselves without a human restarting anything.

**Caveat on message durability:** earlier sections describe reports as
being "recorded and eventually processed" — that's true for the failure
mode this scenario actually tests (a slow consumer), but it should not be
read as a claim that messages can *never* be lost. Because the producer
doesn't use publisher confirmations and RabbitMQ has no persistent Compose
volume in this project, a broker crash/restart or a dropped publish at the
wrong moment can lose a message today. Closing that gap is exactly what
the items above are for.
