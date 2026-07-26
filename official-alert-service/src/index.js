import express from "express";

const app = express();

app.use(express.json());

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

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/alerts", async (req, res) => {
  await delay(randomLatency());

  const now = Date.now();
  const activeAlerts = alerts.filter(
    (alert) => new Date(alert.expiresAt).getTime() > now,
  );

  res.json({ alerts: activeAlerts });
});

app.listen(3000, () =>
  console.log("Official alert service listening on port 3000"),
);
