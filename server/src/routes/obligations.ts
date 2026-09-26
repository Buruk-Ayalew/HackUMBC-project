import { Router } from "express";
import { z } from "zod";
import type { BusinessProfile, ObligationsResponse } from "../../../shared/types.js";
import { requireAuth } from "../middleware/auth.js";
import { getProfileForUser } from "../lib/profile.js";
import { loadLocalTaxRates, loadRules } from "../lib/obligations/rules.js";
import { coverageNotes, employeeThresholds, evaluate, milestones } from "../lib/obligations/engine.js";
import { buildIcs, collectEvents } from "../lib/obligations/calendar.js";

const router = Router();
router.use(requireAuth);

async function evaluateFor(profile: BusinessProfile): Promise<ObligationsResponse> {
  const [rules, taxRates] = await Promise.all([loadRules(), loadLocalTaxRates()]);
  return {
    results: evaluate(profile, rules, taxRates),
    coverageNotes: coverageNotes(profile),
    thresholds: employeeThresholds(rules),
    evaluatedAt: new Date().toISOString(),
  };
}

router.get("/", async (req, res) => {
  const profile = await getProfileForUser(req.session.userId!);
  if (!profile) {
    res.status(404).json({ error: "Set up your business profile first." });
    return;
  }
  res.json(await evaluateFor(profile));
});

// What changes at each headcount on the growth planner's single-slider scale.
router.get("/milestones", async (req, res) => {
  const profile = await getProfileForUser(req.session.userId!);
  if (!profile) {
    res.status(404).json({ error: "Set up your business profile first." });
    return;
  }
  const [rules, taxRates] = await Promise.all([loadRules(), loadLocalTaxRates()]);
  res.json(milestones(profile, rules, taxRates));
});

const whatIfBody = z
  .object({
    employees: z.object({
      totalAllStates: z.number().int().min(0).max(100000),
      inMaryland: z.number().int().min(0).max(100000),
      fullTimeInMaryland: z.number().int().min(0).max(100000),
      coveredByFMLA: z.enum(["yes", "no", "unsure"]).optional(),
    }),
  })
  .refine((b) => b.employees.inMaryland <= b.employees.totalAllStates, {
    message: "Employees in Maryland can't be more than total employees.",
  })
  .refine((b) => b.employees.fullTimeInMaryland <= b.employees.inMaryland, {
    message: "Full-time employees can't be more than Maryland employees.",
  });

router.post("/what-if", async (req, res) => {
  const parsed = whatIfBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the employee counts." });
    return;
  }
  const profile = await getProfileForUser(req.session.userId!);
  if (!profile) {
    res.status(404).json({ error: "Set up your business profile first." });
    return;
  }
  const e = parsed.data.employees;
  const hypothetical: BusinessProfile = {
    ...profile,
    employees: { ...e, coveredByFMLA: e.coveredByFMLA ?? profile.employees.coveredByFMLA },
  };
  res.json(await evaluateFor(hypothetical));
});

router.get("/calendar.ics", async (req, res) => {
  const profile = await getProfileForUser(req.session.userId!);
  if (!profile) {
    res.status(404).json({ error: "Set up your business profile first." });
    return;
  }
  const { results } = await evaluateFor(profile);
  const ics = buildIcs(collectEvents(results));
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="civicpulse-deadlines.ics"');
  res.send(ics);
});

export default router;
