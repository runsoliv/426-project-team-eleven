Service Level Objectives

Official-alert-service:

- Latency: Alert requests must respond within 300 ms at the 95th percentile so residents and emergency responders receive warnings quickly.
- Reliability: Alert requests must succeed at least 99.9% of the time. Alerts use at-least-once delivery because a duplicate warning is safer than a missed warning.

Incident-report-service:  

Latency: Incident reports must be accepted within 500 ms at the 95th percentile so residents quickly know their report was recorded.  

Reliability: Report submissions must succeed at least 99% of the time. Reports use at-most-once processing so retries do not create duplicate incidents.  

Coordinator-service:  

Latency: Combined emergency information must be returned within 700 ms at the 95th percentile so residents can make timely safety decisions.  

Reliability: Coordinator requests must succeed at least 99% of the time. Failed requests may be retried, but duplicate alerts and reports must not appear in the response.  
