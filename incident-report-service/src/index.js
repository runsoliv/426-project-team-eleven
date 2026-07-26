import express from "express";

const app = express();

app.use(express.json());

const reports = [];
const processedKeys = new Map();

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

  const result = {
    status: "recorded",
    report,
  };

  processedKeys.set(idempotencyKey, result);

  if (Math.random() < 0.03) {
    return res.status(503).json({
      error: "incident report service temporarily unavailable",
    });
  }

  res.status(201).json(result);
});

app.listen(3000, () =>
  console.log("Incident report service listening on port 3000"),
);
