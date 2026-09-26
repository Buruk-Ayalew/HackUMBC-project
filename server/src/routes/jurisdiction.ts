import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { JurisdictionError, lookupJurisdiction } from "../lib/jurisdiction.js";

const router = Router();
router.use(requireAuth);

const lookupBody = z.object({ address: z.string().trim().min(5, "Enter a full street address.").max(200) });

router.post("/lookup", async (req, res) => {
  const parsed = lookupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Enter a full street address." });
    return;
  }
  try {
    res.json(await lookupJurisdiction(parsed.data.address));
  } catch (err) {
    if (err instanceof JurisdictionError) {
      const status = err.code === "UNAVAILABLE" ? 503 : 422;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }
    throw err;
  }
});

export default router;
