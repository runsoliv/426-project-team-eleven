import express from "express";

const app = express();

app.use(express.json());

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

app.listen(4000, () =>
  console.log("Incident ambassador listening on port 4000"),
);
