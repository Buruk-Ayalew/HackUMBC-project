import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

// Placeholder for Person 2 (Regulatory Radar).
const router = Router();
router.use(requireAuth);
router.get("/", (_req, res) => {
  res.status(501).json({ error: "Regulatory Radar is not available yet." });
});
export default router;
