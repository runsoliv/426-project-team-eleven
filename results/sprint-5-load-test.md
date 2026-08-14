Sprint 5 Final Load Test Report

Test setup

Script: load-tests/sprint-5-load.js

Raw output: results/sprint-5-load-test-raw-output.txt

Load: 12 virtual users for 60 seconds

Traffic: five GET /alerts requests through Caddy and one POST /reports request through the incident ambassador per iteration

The full instrumented Docker Compose system was started and healthy before the test. The worker began with an empty RabbitMQ queue.

Full k6 summary output

THRESHOLDS

    incident_report_duration
    passed: p(95)<500, p(95)=422.3ms

    incident_report_errors
    passed: rate<0.01, rate=0.00%

    official_alert_duration
    passed: p(95)<300, p(95)=48.12ms

    official_alert_errors
    passed: rate<0.001, rate=0.00%


TOTAL RESULTS

    CUSTOM
    incident_report_duration.......: avg=241.72ms min=110.34ms med=220ms  max=1.01s p(90)=303.97ms p(95)=422.3ms
    incident_report_errors.........: 0.00%  0 out of 312
    official_alert_duration........: avg=18.07ms  min=617.12µs med=2.71ms max=1s    p(90)=16.87ms  p(95)=48.12ms
    official_alert_errors..........: 0.00%  0 out of 1560

    HTTP
    http_req_duration..............: avg=55.35ms  min=617.12µs med=3.32ms max=1.01s p(90)=221.76ms p(95)=282.49ms
      { expected_response:true }...: avg=55.35ms  min=617.12µs med=3.32ms max=1.01s p(90)=221.76ms p(95)=282.49ms
    http_req_failed................: 0.00%  0 out of 1872
    http_reqs......................: 1872   30.130228/s

    EXECUTION
    iteration_duration.............: avg=2.37s    min=2.12s    med=2.26s  max=3.87s p(90)=2.68s    p(95)=3.43s
    iterations.....................: 312    5.021705/s
    vus............................: 2      min=2         max=12
    vus_max........................: 12     min=12        max=12

    NETWORK
    data_received..................: 1.5 MB 24 kB/s
    data_sent......................: 238 kB 3.8 kB/s

SLO comparison

Official-alert latency target: p95 below 300 ms

Official-alert result: 48.12 ms, met

Official-alert reliability target: at least 99.9 percent success

Official-alert result: 100 percent success, met

Incident-report latency target: p95 below 500 ms

Incident-report result: 422.30 ms, met

Incident-report reliability target: at least 99 percent success

Incident-report result: 100 percent success, met

No measured SLO failed. The coordinator SLO in docs/SLO.md was not evaluated because this test does not call a coordinator endpoint.

Sprint 3 comparison

Official-alert p95 increased from 3.36 ms to 48.12 ms, an increase of 44.76 ms.

Incident-report p95 increased from 302.79 ms to 422.30 ms, an increase of 119.51 ms.

Overall p95 increased from 276.96 ms to 282.49 ms, an increase of 5.53 ms.

Throughput decreased from 30.68 to 30.13 requests per second.

Official-alert and incident-report error rates stayed at zero percent.

The final system is slower than the Sprint 3 system, but it still meets both tested latency targets. Async processing, health checks, metrics, Grafana, and JSON logging did not introduce any failed requests. A single run cannot show how much of the latency increase came from instrumentation versus normal host and cache variation.

Bottleneck interpretation

The main request bottleneck is the 100 to 300 ms simulated delay that still runs before an incident report is accepted. This makes the report path much slower than a cached alert read.

Alert reads had a 2.71 ms median but a 1 second maximum. This indicates that cached reads are fast while cache misses create the long tail.

The notification worker processed all 312 reports and the queue returned to zero. It was not the bottleneck during this test. However, one worker processing one message at a time is close to its limit at about five reports per second.

Another sprint

The report service should enqueue validated reports before doing slow work. The worker should be scaled or allowed safe concurrency. Queue depth and end-to-end notification time should be added to Prometheus and Grafana. The alert cache could use background refresh to reduce cache-miss latency.
