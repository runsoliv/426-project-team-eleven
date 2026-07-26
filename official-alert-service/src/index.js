import express from "express";

const app = express();

app.use(express.json());

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const randomLatency = () => 150 + Math.random() * 350;

const SEVERITIES = ["Minor", "Moderate", "Severe", "Extreme"];

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
    weatherType: "Tornado",
    severity: "Severe",
    region: "Central Oklahoma",
    message:
      "Tornado Warning: Radar indicated rotation capable of producing a tornado. Take shelter now in a sturdy building away from windows.",
    durationHours: 1,
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
    weatherType: "Winter Storm",
    severity: "Moderate",
    region: "Western Massachusetts",
    message:
      "Winter Storm Warning: Heavy snowfall of 8-12 inches expected. Travel could be very difficult, especially during evening commute.",
    durationHours: 18,
  },
  {
    weatherType: "Thunderstorm",
    severity: "Moderate",
    region: "Dallas-Fort Worth",
    message:
      "Severe Thunderstorm Warning: Damaging winds up to 60 mph and quarter-size hail possible. Seek shelter indoors.",
    durationHours: 2,
  },
  {
    weatherType: "Heat",
    severity: "Moderate",
    region: "Phoenix Metro Area",
    message:
      "Excessive Heat Warning: Dangerously hot conditions with temperatures up to 115°F expected. Limit outdoor activity and stay hydrated.",
    durationHours: 72,
  },
  {
    weatherType: "Wildfire",
    severity: "Extreme",
    region: "Northern California",
    message:
      "Red Flag Warning: Critical fire weather conditions with low humidity and strong winds. Avoid any activity that could spark a fire.",
    durationHours: 36,
  },
  {
    weatherType: "Coastal Storm",
    severity: "Minor",
    region: "Cape Cod",
    message:
      "Coastal Flood Advisory: Minor tidal flooding expected near coastal roads and low-lying property during high tide.",
    durationHours: 12,
  },
];

const buildAlert = (template, index) => {
  const issuedAt = new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 3);
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

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/alerts", async (req, res) => {
  await delay(randomLatency());

  if (Math.random() < 0.03) {
    return res.status(503).json({
      error: "official alert service temporarily unavailable",
    });
  }

  const activeCount =
    3 + Math.floor(Math.random() * (ALERT_TEMPLATES.length - 2));

  const alerts = ALERT_TEMPLATES.slice(0, activeCount).map(buildAlert);

  res.json({ alerts });
});

app.listen(3000, () =>
  console.log("Official alert service listening on port 3000"),
);
