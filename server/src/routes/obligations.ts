import { Router } from "express";
import { z } from "zod";
import type { BusinessProfile, ObligationRule, ObligationsResponse } from "../../../shared/types.js";
import { requireAuth } from "../middleware/auth.js";
import { getProfileForUser } from "../lib/profile.js";
import { loadRules } from "../lib/obligations/rules.js";
import { coverageNotes, employeeThresholds, evaluate, milestones } from "../lib/obligations/engine.js";
import { getLiveData, isRefreshing, refreshLiveData } from "../lib/obligations/live/index.js";
import { buildIcs, collectEvents } from "../lib/obligations/calendar.js";

const router = Router();
router.use(requireAuth);

type Snapshot = Awaited<ReturnType<typeof getLiveData>>;

function respond(profile: BusinessProfile, rules: ObligationRule[], live: Snapshot): ObligationsResponse {
  return {
    results: evaluate(profile, rules, live),
    coverageNotes: coverageNotes(profile),
    thresholds: employeeThresholds(rules),
    evaluatedAt: new Date().toISOString(),
    sources: Object.values(live.sources),
    liveRefreshedAt: live.refreshedAt,
    refreshing: isRefreshing(),
  };
}

async function evaluateFor(profile: BusinessProfile): Promise<ObligationsResponse> {
  const rules = await loadRules();
  return respond(profile, rules, await getLiveData(rules));
}

router.get("/", async (req, res) => {
  const profile = await getProfileForUser(req.session.userId!);
  if (!profile) {
    res.status(404).json({ error: "Set up your business profile first." });
    return;
  }
  res.json(await evaluateFor(profile));
});

// "Check now": re-read every live value and re-check every rule's source.
router.post("/refresh", async (req, res) => {
  const profile = await getProfileForUser(req.session.userId!);
  if (!profile) {
    res.status(404).json({ error: "Set up your business profile first." });
    return;
  }
  const rules = await loadRules();
  res.json(respond(profile, rules, await refreshLiveData(rules)));
});

// What changes at each headcount on the Growth Planner's single-slider scale.
router.get("/milestones", async (req, res) => {
  const profile = await getProfileForUser(req.session.userId!);
  if (!profile) {
    res.status(404).json({ error: "Set up your business profile first." });
    return;
  }
  const rules = await loadRules();
  res.json(milestones(profile, rules, await getLiveData(rules)));
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
