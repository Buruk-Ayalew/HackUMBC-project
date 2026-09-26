import { Router } from "express";
import { z } from "zod";
import type { LocalRiskNewCount } from "../../../shared/types.js";
import { requireAuth } from "../middleware/auth.js";
import { getProfileForUser } from "../lib/profile.js";
import { DEFAULT_RADIUS_M, RADIUS_OPTIONS_M, searchLocalRisk } from "../lib/risk/search.js";
import { getLocalContext } from "../lib/risk/context/index.js";

const router = Router();
router.use(requireAuth);

const query = z.object({
  radius: z.coerce
    .number()
    .refine((r) => (RADIUS_OPTIONS_M as readonly number[]).includes(r), "Radius must be 402, 805, or 1609 meters.")
    .default(DEFAULT_RADIUS_M),
  refresh: z.enum(["0", "1"]).optional(),
});

// GET /api/local-risk?radius=805&refresh=1
router.get("/", async (req, res) => {
  const parsed = query.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
    return;
  }
  const userId = req.session.userId!;
  const profile = await getProfileForUser(userId);
  if (!profile) {
    res.status(404).json({ error: "No business profile yet." });
    return;
  }
  res.json(
    await searchLocalRisk(profile, {
      radiusMeters: parsed.data.radius,
      force: parsed.data.refresh === "1",
      userId,
    }),
  );
});

// GET /api/local-risk/context?radius=805&refresh=1: zoning, flood zone, and nearby competitors.
router.get("/context", async (req, res) => {
  const parsed = query.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
    return;
  }
  const profile = await getProfileForUser(req.session.userId!);
  if (!profile) {
    res.status(404).json({ error: "No business profile yet." });
    return;
  }
  res.json(await getLocalContext(profile, { radiusMeters: parsed.data.radius, force: parsed.data.refresh === "1" }));
});

// GET /api/local-risk/new-count: summary for the dashboard card (default radius).
router.get("/new-count", async (req, res) => {
  const userId = req.session.userId!;
  const profile = await getProfileForUser(userId);
  if (!profile) {
    res.status(404).json({ error: "No business profile yet." });
    return;
  }
  const result = await searchLocalRisk(profile, { radiusMeters: DEFAULT_RADIUS_M, userId });
  const body: LocalRiskNewCount = {
    newCount: result.items.filter((i) => i.isNew).length,
    highCount: result.items.filter((i) => i.riskLevel === "high").length,
  };
  res.json(body);
});

export default router;
