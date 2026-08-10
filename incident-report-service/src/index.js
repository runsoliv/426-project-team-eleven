import express from "express";
import amqp from "amqplib";

const app = express();

app.use(express.json());

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
  console.log(`enqueued incident ${report.id}`);

  const result = {
    status: "recorded",
    report,
  };

  processedKeys.set(idempotencyKey, result);

  res.status(201).json(result);
});

app.listen(3000, () =>
  console.log("Incident report service listening on port 3000"),
);
