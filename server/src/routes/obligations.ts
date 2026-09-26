import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);
router.get("/", (_req, res) => {
  res.json([]);
});
export default router;
