import express from "express";
import client from "prom-client";
import { createClient } from "redis";

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

const REPLICA_LABEL = process.env.REPLICA_LABEL || "official-alert-single";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS) || 30;

const redisClient = createClient({ url: REDIS_URL });

redisClient.on("error", (err) =>
  log("error", "Redis client error", {
    replica: REPLICA_LABEL,
    error: err.message,
  }),
);

let redisReady = false;

redisClient
  .connect()
  .then(() => {
    redisReady = true;
    log("info", "connected to Redis", {
      replica: REPLICA_LABEL,
      redisUrl: REDIS_URL,
    });
  })
  .catch((err) => {
    log("error", "failed to connect to Redis", {
      replica: REPLICA_LABEL,
      error: err.message,
    });
  });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const randomLatency = () => 150 + Math.random() * 350;

const ALERT_TEMPLATES = [
  {
    weatherType: "Hurricane",
    severity: "Extreme",
    region: "South Florida",
    message:
      "Hurricane Warning: Category 3 hurricane expected to make landfall within 24 hours. Residents should evacuate low-lying areas immediately.",
    durationHours: 48,
  },
  {
    weatherType: "Flood",
    severity: "Severe",
    region: "Miami-Dade County",
    message:
      "Flash Flood Warning: Heavy rainfall has caused rapid water rise on roadways. Avoid travel through flooded areas.",
    durationHours: 6,
  },
  {
    weatherType: "Storm Surge",
    severity: "Extreme",
    region: "Fort Lauderdale",
    message:
      "Storm Surge Warning: Life-threatening inundation from rising water is expected along the coast. Follow evacuation orders for low-lying areas.",
    durationHours: 24,
  },
  {
    weatherType: "Tropical Storm",
    severity: "Moderate",
    region: "Miami-Fort Lauderdale Area",
    message:
      "Tropical Storm Warning: Sustained winds of 40-70 mph expected. Secure loose outdoor objects and avoid unnecessary travel.",
    durationHours: 12,
  },
  {
    weatherType: "Tornado",
    severity: "Severe",
    region: "Dallas-Fort Worth",
    message:
      "Tornado Warning: Radar indicated rotation capable of producing a tornado. Take shelter now in a sturdy building away from windows.",
    durationHours: 1,
  },
  {
    weatherType: "Thunderstorm",
    severity: "Moderate",
    region: "North Texas",
    message:
      "Severe Thunderstorm Warning: Damaging winds up to 60 mph and quarter-size hail possible. Seek shelter indoors.",
    durationHours: 2,
  },
  {
    weatherType: "Flood",
    severity: "Moderate",
    region: "Fort Worth Metro Area",
    message:
      "Flash Flood Warning: Slow-moving storms have produced heavy rainfall over the area. Do not drive through flooded roads.",
    durationHours: 6,
  },
  {
    weatherType: "Tornado",
    severity: "Minor",
    region: "North Texas",
    message:
      "Tornado Watch: Conditions are favorable for tornado development. Stay informed and be ready to take shelter.",
    durationHours: 4,
  },
];

const buildAlert = (template, index) => {
  const issuedAt = new Date(Date.now() - Math.random() * 1000 * 60 * 60);
  const expiresAt = new Date(
    issuedAt.getTime() + template.durationHours * 60 * 60 * 1000,
  );

  return {
    id: `alert-${index + 1}`,
    weatherType: template.weatherType,
    severity: template.severity,
    region: template.region,
    message: template.message,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
};

const alerts = ALERT_TEMPLATES.map(buildAlert);

// Weather archetypes used to synthesize alerts on demand for a requested
// region. These are intentionally generic so any region string works, not
// just the two regions the load test focuses on.
const REGION_WEATHER_ARCHETYPES = [
  {
    weatherType: "Hurricane",
    severity: "Extreme",
    durationHours: 48,
    message: (region) =>
      `Hurricane Warning for ${region}: Category 3 hurricane expected to make landfall within 24 hours. Residents should evacuate low-lying areas immediately.`,
  },
  {
    weatherType: "Tornado",
    severity: "Severe",
    durationHours: 1,
    message: (region) =>
      `Tornado Warning for ${region}: Radar indicated rotation capable of producing a tornado. Take shelter now in a sturdy building away from windows.`,
  },
  {
    weatherType: "Flood",
    severity: "Severe",
    durationHours: 6,
    message: (region) =>
      `Flash Flood Warning for ${region}: Heavy rainfall has caused rapid water rise on roadways. Avoid travel through flooded areas.`,
  },
  {
    weatherType: "Thunderstorm",
    severity: "Moderate",
    durationHours: 2,
    message: (region) =>
      `Severe Thunderstorm Warning for ${region}: Damaging winds up to 60 mph and quarter-size hail possible. Seek shelter indoors.`,
  },
  {
    weatherType: "Tropical Storm",
    severity: "Moderate",
    durationHours: 12,
    message: (region) =>
      `Tropical Storm Warning for ${region}: Sustained winds of 40-70 mph expected. Secure loose outdoor objects and avoid unnecessary travel.`,
  },
];

let syntheticAlertSequence = 0;

const generateSyntheticAlertsForRegion = (region) => {
  const alertCount = 1 + Math.floor(Math.random() * 2);
  const regionSlug = region.toLowerCase().replace(/\s+/g, "-");
  const generated = [];

  for (let i = 0; i < alertCount; i += 1) {
    const archetype =
      REGION_WEATHER_ARCHETYPES[
        Math.floor(Math.random() * REGION_WEATHER_ARCHETYPES.length)
      ];
    const issuedAt = new Date(Date.now() - Math.random() * 1000 * 60 * 60);
    const expiresAt = new Date(
      issuedAt.getTime() + archetype.durationHours * 60 * 60 * 1000,
    );

    syntheticAlertSequence += 1;

    generated.push({
      id: `alert-${regionSlug}-${syntheticAlertSequence}`,
      weatherType: archetype.weatherType,
      severity: archetype.severity,
      region,
      message: archetype.message(region),
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  }

  return generated;
};

// Normalize so "North Texas", "north texas", and "  North Texas  " all
// share one cache entry instead of fragmenting the cache per request.
const cacheKeyForRegion = (region) =>
  `alerts:region:${region.trim().toLowerCase()}`;

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/alerts", async (req, res) => {
  const rawRegion = req.query.region;
  const region =
    typeof rawRegion === "string" && rawRegion.trim() ? rawRegion.trim() : null;

  // Preserve the legacy "list everything" behavior when no region is
  // supplied. Caching only applies to the region-scoped read path below.
  if (!region) {
    await delay(randomLatency());

    const now = Date.now();
    const activeAlerts = alerts.filter(
      (alert) => new Date(alert.expiresAt).getTime() > now,
    );

    return res.json({ alerts: activeAlerts, servedBy: REPLICA_LABEL });
  }

  const cacheKey = cacheKeyForRegion(region);

  if (redisReady) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return res.json({
          region,
          alerts: JSON.parse(cached),
          cache: "hit",
          servedBy: REPLICA_LABEL,
        });
      }
    } catch (err) {
      log("error", "Redis GET failed", {
        replica: REPLICA_LABEL,
        error: err.message,
      });
    }
  }

  await delay(randomLatency());

  const regionAlerts = generateSyntheticAlertsForRegion(region);

  if (redisReady) {
    try {
      await redisClient.set(cacheKey, JSON.stringify(regionAlerts), {
        EX: CACHE_TTL_SECONDS,
      });
    } catch (err) {
      log("error", "Redis SET failed", {
        replica: REPLICA_LABEL,
        error: err.message,
      });
    }
  }

  res.json({
    region,
    alerts: regionAlerts,
    cache: "miss",
    servedBy: REPLICA_LABEL,
  });
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(3000, () =>
  log("info", "Official alert service listening on port 3000", {
    replica: REPLICA_LABEL,
  }),
);