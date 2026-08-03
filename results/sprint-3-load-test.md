# Sprint 3 Load Test Report

**Script:** [`load-tests/sprint-3-load.js`](../load-tests/sprint-3-load.js)
**Tool:** k6 (`grafana/k6` Docker image)
**Target:** full `docker compose` stack (Caddy → `official-alert-a`/`official-alert-b` → shared Redis cache, and `incident-ambassador` → `incident-report-service`)
**Load profile:** 12 virtual users, 45 seconds (exceeds the required 10 VUs / 30 s minimum)
**Traffic mix:** each VU iteration does 5 official-alert reads (alternating `North Texas` / `South Florida`) followed by 1 incident-report submission with a unique `Idempotency-Key`, then sleeps ~1s before repeating
**Raw console output:** [`sprint-3-load-test-raw-output.txt`](./sprint-3-load-test-raw-output.txt)

## Overall results

| Metric | Value |
|---|---|
| Total requests | 1,446 (`http_reqs`) |
| Requests per second | 30.68 req/s |
| Checks passed | 2,651 / 2,651 (100%) |
| p50 latency (all requests) | 2.28 ms |
| p95 latency (all requests) | 276.96 ms |
| p99 latency (all requests) | 331.89 ms |
| Error rate (`http_req_failed`) | 0.00% (0 / 1,446) |

The overall percentiles blend two very different distributions (near-instant cached alert reads and slower incident-report writes), so the per-service breakdown below is the more meaningful view.

## Official-alert-service (via Caddy, Redis-cached)

| Metric | Value | SLO target (`docs/SLO.md`) | Result |
|---|---|---|---|
| p50 | 2.15 ms | — | — |
| p95 | 3.36 ms | ≤ 300 ms | ✅ Pass (99% margin) |
| p99 | 360.55 ms | — | — |
| Requests | 1,205 | — | — |
| Error rate | 0.00% (0 / 1,205) | ≥ 99.9% success (≤ 0.1% errors) | ✅ Pass |

**Cache observations:**

| Metric | Value |
|---|---|
| Cache hits | 1,176 |
| Cache misses | 29 |
| Hit rate | ~97.6% |

With only two regions in rotation (`North Texas`, `South Florida`) and both `official-alert-a` and `official-alert-b` sharing the same Redis instance, only the first request per region (per 30s TTL window) misses — every other read across either replica is served from cache. This is visible in the latency shape: p50/p90/p95 sit under 4 ms (cache hits skip the simulated 150–350 ms backend latency entirely), while p99 jumps to 360 ms because a small fraction of requests land right after a key expires and pay the full cache-miss cost.

## Incident-report-service (via incident-ambassador)

| Metric | Value | SLO target (this project) | Result |
|---|---|---|---|
| p50 | 211.33 ms | — | — |
| p95 | 302.79 ms | ≤ 500 ms | ✅ Pass (40% margin) |
| p99 | 309.23 ms | — | — |
| Requests | 241 | — | — |
| Error rate | 0.00% (0 / 241) | ≥ 99% success (≤ 1% errors) | ✅ Pass |

Every submission used a freshly generated `Idempotency-Key` (`k6-<vu>-<iter>-<timestamp>-<random>`), so this measures the "new incident" code path, not the deduplicated-replay path. All 241 submissions came back `201 Created`.

## Bottleneck interpretation

- **Official-alert-service** is not latency-bound under this load — Redis caching removes almost all of the simulated 150–350 ms backend delay for repeat reads of the same region, which is exactly the "frequently accessed read path" this cache was designed for. The remaining tail latency (p99 ≈ 360 ms) is fully explained by cache misses (~2.4% of reads), not by contention, connection limits, or the Caddy load balancer.
- **Incident-report-service** is essentially bound by its own simulated processing latency (100–300 ms `setTimeout`) on every request, since writes are inherently uncacheable. p95 (302.79 ms) tracks closely with p99 (309.23 ms), indicating a tight, predictable latency distribution rather than a long tail — there's no evidence of queuing or resource exhaustion at this load level (12 VUs / ~5 reports/sec).
- Neither service showed any failed checks or non-2xx responses at this load, so 12 VUs / 45 s is comfortably within both services' current capacity. The real constraint on official-alert-service's worst case (p99) is the cache TTL/miss rate, not compute.

## Suggested future improvement

- Increase VU count and/or introduce a ramping load profile (e.g. k6 `stages` from 10 → 50 → 100 VUs) to find the actual breaking point of `incident-report-service`, since its per-request latency is fixed and doesn't benefit from caching — it will be the first service to violate its SLO as concurrency grows.
- Add a stale-while-revalidate or background-refresh strategy for the official-alert cache so the ~2.4% of requests that currently pay the full cache-miss latency (and drive p99) instead get a slightly-stale cached response while the refresh happens asynchronously, further flattening the tail.
- Track cache hit rate as a first-class metric in production (not just in the load test) with alerting if it drops below a threshold, since a falling hit rate would be an early warning that regions are fragmenting the cache key space or that Redis is unavailable/evicting early.
