import express from "express";
import client from "prom-client";
import amqp from "amqplib";

const app = express();

app.use(express.json());

const log = (level, message, fields = {}) => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...fields,
    }),
  );
};

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

    log("info", "request", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTimeMs: durationMs,
    });
  });

  next();
});

const reports = [];
const processedKeys = new Map();

const QUEUE = "incident-notifications";
const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "localhost";

const connection = await amqp.connect(
  `amqp://alerts:alerts@${RABBITMQ_HOST}:5672`,
);
const channel = await connection.createChannel();
await channel.assertQueue(QUEUE, { durable: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const randomLatency = () => 100 + Math.random() * 200;

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/reports", (req, res) => {
  res.json({ reports });
});

app.post("/reports", async (req, res) => {
  const idempotencyKey = req.headers["idempotency-key"];

  if (!idempotencyKey) {
    return res.status(400).json({
      error: "Idempotency-Key header is required",
    });
  }

  if (processedKeys.has(idempotencyKey)) {
    return res.json({
      ...processedKeys.get(idempotencyKey),
      duplicate: true,
    });
  }

  const { region, hazardType, location, description } = req.body;

  if (!region || !hazardType || !location || !description) {
    return res.status(400).json({
      error: "region, hazardType, location, and description are required",
    });
  }

  await delay(randomLatency());

  const report = {
    id: `incident-${reports.length + 1}`,
    region,
    hazardType,
    location,
    description,
    status: "recorded",
    reportedAt: new Date().toISOString(),
  };

  reports.push(report);

  channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(report)), {
    persistent: true,
  });

  log("info", "incident enqueued", { incidentId: report.id });

  const result = {
    status: "recorded",
    report,
  };

  processedKeys.set(idempotencyKey, result);

  res.status(201).json(result);
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(3000, () =>
  log("info", "Incident report service listening on port 3000"),
);