import http from "k6/http";
import { sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const ALERTS_URL = __ENV.ALERTS_URL || "http://localhost:3002";
const REPORTS_URL = __ENV.AMBASSADOR_URL || "http://localhost:4000";

const alertDuration = new Trend("official_alert_duration", true);
const alertErrors = new Rate("official_alert_errors");
const reportDuration = new Trend("incident_report_duration", true);
const reportErrors = new Rate("incident_report_errors");

export const options = {
  vus: 12,
  duration: "60s",
  thresholds: {
    official_alert_duration: ["p(95)<300"],
    official_alert_errors: ["rate<0.001"],
    incident_report_duration: ["p(95)<500"],
    incident_report_errors: ["rate<0.01"],
  },
};

export default function () {
  const reportRegion = __ITER % 2 === 0 ? "North Texas" : "South Florida";

  for (let i = 0; i < 5; i += 1) {
    const region = (__ITER + i) % 2 === 0 ? "North Texas" : "South Florida";
    const response = http.get(
      `${ALERTS_URL}/alerts?region=${encodeURIComponent(region)}`,
    );

    alertDuration.add(response.timings.duration);
    alertErrors.add(response.status !== 200);
    sleep(0.2);
  }

  const response = http.post(
    `${REPORTS_URL}/reports`,
    JSON.stringify({
      region: reportRegion,
      hazardType: "flooding",
      location: "Main St",
      description: `Load test report from VU ${__VU}`,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `k6-${__VU}-${__ITER}-${Date.now()}`,
      },
    },
  );

  reportDuration.add(response.timings.duration);
  reportErrors.add(response.status !== 201);
  sleep(1);
}
