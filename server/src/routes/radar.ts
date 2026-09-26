import { Router, type Request, type Response } from "express";
import type { BusinessProfile } from "../../../shared/types.js";
import { requireAuth } from "../middleware/auth.js";
import { getProfileForUser, getSampleProfiles } from "../lib/profile.js";
import { buildRadarResponse } from "../lib/radar/service.js";

const router = Router();
router.use(requireAuth);

// TEMPORARY for testing: ?profileId=<sample profile id> runs the Radar against
// one of server/data/sample-profiles.json. Remove before the demo.
async function loadProfile(req: Request): Promise<BusinessProfile | null> {
  const sampleId = typeof req.query.profileId === "string" ? req.query.profileId : null;
  if (sampleId && process.env.NODE_ENV !== "production") {
    return (await getSampleProfiles()).find((p) => p.id === sampleId) ?? null;
  }
  return getProfileForUser(req.session.userId!);
}

async function respond(req: Request, res: Response, forceRefresh: boolean) {
  const profile = await loadProfile(req);
  if (!profile) {
    res.status(404).json({ error: "No business profile yet. Finish setup first." });
    return;
  }
  try {
    res.json(await buildRadarResponse(profile, forceRefresh));
  } catch (err) {
    console.error("[radar] request failed", err);
    res.status(503).json({ error: "Regulatory Radar is unavailable right now and there are no saved results yet. Try again later." });
  }
}

router.get("/", (req, res) => respond(req, res, false));
router.post("/refresh", (req, res) => respond(req, res, true));

export default router;
