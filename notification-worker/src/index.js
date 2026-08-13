import express from "express";
import client from "prom-client";
import amqp from "amqplib";
import os from "node:os";

const workerId = process.argv[2] || os.hostname();
const QUEUE = "incident-notifications";
const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "localhost";
const PORT = 3000;

// Failure-injection toggle: see results/sprint-4-failure.md. Simulates a
// worker that has fallen behind (e.g. a slow downstream notification
// provider) instead of the normal near-instant processing time.
const DELAY_MODE_ENABLED = process.env.WORKER_DELAY_MODE === "true";
const NORMAL_PROCESSING_MS = 200;
const DELAY_MODE_PROCESSING_MS = [4000, 8000];

const randomBetween = ([min, max]) => min + Math.random() * (max - min);

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

let rabbitmqStatus = "connecting";
let processedCount = 0;
let lastProcessedAt = null;

const connection = await amqp.connect(
  `amqp://alerts:alerts@${RABBITMQ_HOST}:5672`,
);

connection.on("error", (err) => {
  log("error", "RabbitMQ connection error", {
    workerId,
    error: err.message,
  });
  rabbitmqStatus = "disconnected";
});

connection.on("close", () => {
  log("error", "RabbitMQ connection closed", { workerId });
  rabbitmqStatus = "disconnected";
});

const channel = await connection.createChannel();
await channel.assertQueue(QUEUE, { durable: true });
channel.prefetch(1);
rabbitmqStatus = "connected";

log("info", "worker waiting for jobs", {
  workerId,
  delayMode: DELAY_MODE_ENABLED,
});

channel.consume(QUEUE, async (msg) => {
  if (msg === null) return;

  const report = JSON.parse(msg.content.toString());

  log("info", "processing incident", {
    workerId,
    incidentId: report.id,
  });

  const processingMs = DELAY_MODE_ENABLED
    ? randomBetween(DELAY_MODE_PROCESSING_MS)
    : NORMAL_PROCESSING_MS;

  await new Promise((resolve) => setTimeout(resolve, processingMs));

  processedCount += 1;
  lastProcessedAt = new Date().toISOString();

  log("info", "notification sent", {
    workerId,
    incidentId: report.id,
    delayMode: DELAY_MODE_ENABLED,
  });

  channel.ack(msg);
});

const app = express();

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

app.get("/health", async (req, res) => {
  let queueDepth = null;

  try {
    const info = await channel.checkQueue(QUEUE);
    queueDepth = info.messageCount;
  } catch (err) {
    queueDepth = null;
  }

  const status = rabbitmqStatus === "connected" ? "ok" : "degraded";

  res.status(status === "ok" ? 200 : 503).json({
    status,
    workerId,
    rabbitmq: rabbitmqStatus,
    queue: QUEUE,
    queueDepth,
    processedCount,
    lastProcessedAt,
    delayMode: DELAY_MODE_ENABLED,
  });
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(PORT, () =>
  log("info", "worker health endpoint listening", {
    workerId,
    port: PORT,
  }),
);