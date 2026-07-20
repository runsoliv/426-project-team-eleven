Service Level Objectives

Official-alert-service:

- Latency: Alert requests must respond within 300 ms at the 95th percentile so residents and emergency responders receive warnings quickly.
- Reliability: Alert requests must succeed at least 99.9% of the time. Alerts use at-least-once delivery because a duplicate warning is safer than a missed warning.
