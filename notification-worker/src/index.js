import express from "express";
import amqp from "amqplib";
import os from "node:os";

const workerId = process.argv[2] || os.hostname();
const QUEUE = "incident-notifications";
const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "localhost";
const PORT = 3000;

let rabbitmqStatus = "connecting";
let processedCount = 0;
let lastProcessedAt = null;

const connection = await amqp.connect(
  `amqp://alerts:alerts@${RABBITMQ_HOST}:5672`,
);

connection.on("error", (err) => {
  console.error(`worker ${workerId} RabbitMQ connection error`, err.message);
  rabbitmqStatus = "disconnected";
});

connection.on("close", () => {
  console.error(`worker ${workerId} RabbitMQ connection closed`);
  rabbitmqStatus = "disconnected";
});

const channel = await connection.createChannel();
await channel.assertQueue(QUEUE, { durable: true });
channel.prefetch(1);
rabbitmqStatus = "connected";

console.log(`worker ${workerId} waiting for jobs`);

channel.consume(QUEUE, async (msg) => {
  if (msg === null) return;

  const report = JSON.parse(msg.content.toString());
  console.log(`worker ${workerId} processing incident ${report.id}`);

  await new Promise((resolve) => setTimeout(resolve, 200));

  processedCount += 1;
  lastProcessedAt = new Date().toISOString();

  console.log(`worker ${workerId} sent notification for incident ${report.id}`);
  channel.ack(msg);
});

const app = express();

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
  });
});

app.listen(PORT, () =>
  console.log(`worker ${workerId} health endpoint listening on port ${PORT}`),
);
