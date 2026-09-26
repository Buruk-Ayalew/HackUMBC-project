import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

// Placeholder for Person 3 (Local Risk).
const router = Router();
router.use(requireAuth);
router.get("/", (_req, res) => {
  res.status(501).json({ error: "Local Risk is not available yet." });
});
router.get("/new-count", (_req, res) => {
  res.status(501).json({ error: "Local Risk is not available yet." });
});
export default router;
