import amqp from "amqplib";
import os from "node:os";

const workerId = process.argv[2] || os.hostname();
const QUEUE = "incident-notifications";
const RABBITMQ_HOST = process.env.RABBITMQ_HOST || "localhost";

const connection = await amqp.connect(
  `amqp://alerts:alerts@${RABBITMQ_HOST}:5672`,
);
const channel = await connection.createChannel();
await channel.assertQueue(QUEUE, { durable: true });
channel.prefetch(1);

console.log(`worker ${workerId} waiting for jobs`);

channel.consume(QUEUE, async (msg) => {
  if (msg === null) return;

  const report = JSON.parse(msg.content.toString());
  console.log(`worker ${workerId} processing incident ${report.id}`);

  await new Promise((resolve) => setTimeout(resolve, 200));

  console.log(`worker ${workerId} sent notification for incident ${report.id}`);
  channel.ack(msg);
});
