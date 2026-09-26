import express from "express";
import session from "express-session";
import authRouter from "./routes/auth.js";
import profileRouter from "./routes/profile.js";
import jurisdictionRouter from "./routes/jurisdiction.js";
import obligationsRouter from "./routes/obligations.js";
import radarRouter from "./routes/radar.js";
import localRiskRouter from "./routes/localRisk.js";
import { seedDemoUser } from "./lib/users.js";
import { startRiskJob } from "./jobs/riskJob.js";
import { startRadarJob } from "./jobs/radarJob.js";
import { startObligationsJob } from "./jobs/obligationsJob.js";

const PORT = Number(process.env.PORT ?? 3001);

if (!process.env.SESSION_SECRET) {
  console.warn("SESSION_SECRET is not set in server/.env; using an insecure development secret.");
}

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(
  session({
    name: "civicpulse.sid",
    secret: process.env.SESSION_SECRET ?? "dev-only-insecure-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 * 7 },
  }),
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/jurisdiction", jurisdictionRouter);
app.use("/api/obligations", obligationsRouter);
app.use("/api/radar", radarRouter);
app.use("/api/local-risk", localRiskRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found." });
});

// Last-resort error handler: never leak stack traces, always return JSON.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong on our side. Try again." });
});

await seedDemoUser();
startRiskJob();
startRadarJob();
startObligationsJob();
app.listen(PORT, () => {
  console.log(`CivicPulse MD API on http://localhost:${PORT}`);
});
