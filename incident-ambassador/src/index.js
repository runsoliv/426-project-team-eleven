import express from "express";
import client from "prom-client";

const app = express();

app.use(express.json());

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests received",
  labelNames: ["method", "route", "status_code"],
});

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_ms",
  help: "HTTP request duration in milliseconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
});

app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const labels = {
      method: req.method,
      route: req.path,
      status_code: res.statusCode,
    };

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationMs);
  });

  next();
});

const forwardTo = async (path, options, res) => {
  for (const attempt of [1, 2]) {
    try {
      const response = await fetch(
        `http://incident-report-service:3000${path}`,
        options,
      );

      const data = await response.json();

      if (response.status === 503 && attempt === 1) {
        continue;
      }

      return res.status(response.status).json(data);
    } catch (err) {
      if (attempt === 2) {
        return res.status(502).json({
          error: "incident report service unavailable",
        });
      }
    }
  }
};

app.get("/health", async (req, res) => {
  console.log(`${req.method} ${req.url} ${new Date().toISOString()}`);

  await forwardTo(
    "/health",
    {
      method: "GET",
    },
    res,
  );
});

app.get("/reports", async (req, res) => {
  console.log(`${req.method} ${req.url} ${new Date().toISOString()}`);

  await forwardTo(
    "/reports",
    {
      method: "GET",
    },
    res,
  );
});

app.post("/reports", async (req, res) => {
  console.log(`${req.method} ${req.url} ${new Date().toISOString()}`);

  await forwardTo(
    "/reports",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": req.headers["idempotency-key"] || "",
      },
      body: JSON.stringify(req.body),
    },
    res,
  );
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(4000, () =>
  console.log("Incident ambassador listening on port 4000"),
);