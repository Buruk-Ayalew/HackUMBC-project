import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { BusinessProfile } from "../../../shared/types.js";
import { requireAuth } from "../middleware/auth.js";
import { getProfileForUser, getSampleProfiles, saveProfile } from "../lib/profile.js";
import { profileInput } from "../lib/profileSchema.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const profile = await getProfileForUser(req.session.userId!);
  if (!profile) {
    res.status(404).json({ error: "No business profile yet." });
    return;
  }
  res.json(profile);
});

async function upsert(req: Request, res: Response, mode: "create" | "update") {
  const userId = req.session.userId!;
  const parsed = profileInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check your answers." });
    return;
  }
  const existing = await getProfileForUser(userId);
  if (mode === "update" && !existing) {
    res.status(404).json({ error: "No business profile yet." });
    return;
  }
  const profile: BusinessProfile = {
    ...parsed.data,
    id: existing?.id ?? randomUUID(),
    userId,
    updatedAt: new Date().toISOString(),
  };
  await saveProfile(profile);
  res.status(existing ? 200 : 201).json(profile);
}

router.post("/", (req, res) => upsert(req, res, "create"));
router.put("/", (req, res) => upsert(req, res, "update"));

// TEMPORARY testing helper (profile switcher in Settings). Remove before the demo.
router.get("/samples", async (_req, res) => {
  const samples = await getSampleProfiles();
  res.json(
    samples.map((s) => ({
      id: s.id,
      businessName: s.businessName,
      industry: s.industry,
      county: s.jurisdiction.county,
    })),
  );
});

router.post("/load-sample", async (req, res) => {
  const samples = await getSampleProfiles();
  const sample = samples.find((s) => s.id === req.body?.sampleId);
  if (!sample) {
    res.status(404).json({ error: "Sample not found." });
    return;
  }
  const userId = req.session.userId!;
  const existing = await getProfileForUser(userId);
  const profile = await saveProfile({
    ...sample,
    id: existing?.id ?? randomUUID(),
    userId,
    updatedAt: new Date().toISOString(),
  });
  res.json(profile);
});

export default router;
