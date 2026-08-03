import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// Run through Caddy (load-balanced official-alert-a/b) and through the
// incident ambassador, matching how a real client would reach these
// services. Defaults assume `docker compose` service names; override with
// -e ALERTS_URL=... -e AMBASSADOR_URL=... to point at localhost instead.
const ALERTS_BASE_URL = __ENV.ALERTS_URL || "http://localhost:3002";
const AMBASSADOR_BASE_URL = __ENV.AMBASSADOR_URL || "http://localhost:4000";

const REGIONS = ["North Texas", "South Florida"];
const HAZARD_TYPES = [
  "flooding",
  "downed power line",
  "blocked road",
  "structural damage",
  "gas leak",
];
const LOCATIONS = [
  "Main St & 5th Ave",
  "Highway 20 overpass",
  "Riverside neighborhood",
  "Downtown emergency shelter",
  "County Rd 12",
];

// Separate Trend/Rate metrics per service so the summary clearly
// distinguishes official-alert results from incident-report results,
// instead of everything blending into the generic http_req_duration metric.
const officialAlertDuration = new Trend("official_alert_duration", true);
const officialAlertErrors = new Rate("official_alert_errors");
const officialAlertCacheHits = new Counter("official_alert_cache_hits");
const officialAlertCacheMisses = new Counter("official_alert_cache_misses");

const incidentReportDuration = new Trend("incident_report_duration", true);
const incidentReportErrors = new Rate("incident_report_errors");

export const options = {
  vus: 12,
  duration: "45s",
  // Ensure p50/p99 show up in the end-of-test summary alongside the k6
  // defaults (avg/min/med/max/p90/p95).
  summaryTrendStats: ["avg", "min", "med", "p(50)", "p(90)", "p(95)", "p(99)", "max"],
  thresholds: {
    // Mirrors the official-alert-service target in docs/SLO.md.
    official_alert_duration: ["p(95)<300"],
    official_alert_errors: ["rate<0.001"],
    // Mirrors this project's incident-report-service SLO.
    incident_report_duration: ["p(95)<500"],
    incident_report_errors: ["rate<0.01"],
  },
};

function readOfficialAlert(region) {
  const res = http.get(
    `${ALERTS_BASE_URL}/alerts?region=${encodeURIComponent(region)}`,
    { tags: { endpoint: "official-alert", region } },
  );

  officialAlertDuration.add(res.timings.duration);

  const ok = check(res, {
    "official-alert status is 200": (r) => r.status === 200,
    "official-alert response has alerts array": (r) => {
      try {
        return Array.isArray(r.json("alerts"));
      } catch (err) {
        return false;
      }
    },
  });

  officialAlertErrors.add(!ok);

  if (ok) {
    const cacheState = res.json("cache");
    if (cacheState === "hit") officialAlertCacheHits.add(1);
    if (cacheState === "miss") officialAlertCacheMisses.add(1);
  }
}

function submitIncidentReport(region, vu, iter) {
  // A fresh key per submission so retries/duplicates are never expected;
  // this exercises the "new incident" path rather than the idempotent replay path.
  const idempotencyKey = `k6-${vu}-${iter}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const payload = JSON.stringify({
    region,
    hazardType: HAZARD_TYPES[Math.floor(Math.random() * HAZARD_TYPES.length)],
    location: LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)],
    description: `Load test submission from VU ${vu}, iteration ${iter}`,
  });

  const res = http.post(`${AMBASSADOR_BASE_URL}/reports`, payload, {
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    tags: { endpoint: "incident-report", region },
  });

  incidentReportDuration.add(res.timings.duration);

  const ok = check(res, {
    "incident-report status is 201": (r) => r.status === 201,
  });

  incidentReportErrors.add(!ok);
}

// Mostly official-alert reads, with an occasional incident-report
// submission mixed in, matching a realistic access pattern: residents
// refresh alerts far more often than they file a new incident report.
const READS_PER_ITERATION = 5;

export default function () {
  group("official alert reads", () => {
    for (let i = 0; i < READS_PER_ITERATION; i += 1) {
      const region = REGIONS[(__ITER + i) % REGIONS.length];
      readOfficialAlert(region);
      sleep(0.2);
    }
  });

  group("incident report submission", () => {
    const region = REGIONS[__ITER % REGIONS.length];
    submitIncidentReport(region, __VU, __ITER);
  });

  sleep(1);
}
