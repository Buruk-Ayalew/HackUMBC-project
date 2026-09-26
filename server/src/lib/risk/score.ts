import type { RiskCategory, RiskLevel } from "../../../../shared/types.js";
import type { NormalizedRiskItem } from "./normalize.js";

// Rule-based risk level. Inputs are only distance, project type, and timing as
// reported by the source. No percentages, no foot-traffic or revenue estimates.
//
// High:   major work (closure, road work, demolition, new construction, site work)
//         that is happening now or within 30 days, within 150 m (~500 ft);
//         or a full road closure / active state road construction within 400 m.
// Medium: other major work within 800 m; commercial work within 150 m with a
//         reported cost of $100,000+; commercial work of $1M+ within 400 m.
// Low:    everything else, plus anything on hold or still in planning/design.
// Development plans (future work, no schedule) are never High: Medium within
// 400 m (or if the business is inside the plan area), otherwise Low.

export const NEAR_M = 150;
export const CLOSE_M = 400;
export const MID_M = 800;
const SOON_DAYS = 30;
const SIZABLE_COST_USD = 100_000;
const LARGE_COST_USD = 1_000_000;

const MAJOR: RiskCategory[] = ["road_closure", "road_work", "demolition", "new_construction", "site_work"];

const CATEGORY_REASON: Record<RiskCategory, string> = {
  road_closure: "Road closure",
  road_work: "State road project",
  demolition: "Demolition",
  new_construction: "New construction",
  site_work: "Grading or site work",
  commercial_work: "Commercial building work",
  residential_work: "Residential work (usually small)",
  development_plan: "Development plan filed with the county",
  other: "Permitted work",
};

type Timing =
  | { kind: "now" }
  | { kind: "soon"; days: number }
  | { kind: "later"; days: number }
  | { kind: "pending" } // permit applied for, not issued
  | { kind: "planning" } // SHA planning/design phase
  | { kind: "on_hold" }
  | { kind: "unknown" };

const DAY = 86_400_000;

function timing(item: NormalizedRiskItem, now: number): Timing {
  if (item.facts.onHold) return { kind: "on_hold" };
  if (item.facts.notYetIssued) return { kind: "pending" };
  if (item.facts.phase && /planning|design/i.test(item.facts.phase)) return { kind: "planning" };

  const start = item.startDate ? Date.parse(item.startDate) : NaN;
  if (item.source === "md_road_closures" || item.source === "mdot_sha_projects") {
    if (Number.isFinite(start) && start > now) {
      const days = Math.ceil((start - now) / DAY);
      return days <= SOON_DAYS ? { kind: "soon", days } : { kind: "later", days };
    }
    if (item.source === "mdot_sha_projects" && !item.facts.phase) return { kind: "unknown" };
    return { kind: "now" };
  }
  // Issued, unexpired permits: work may be happening now.
  return { kind: "now" };
}

export function formatDistance(m: number): string {
  const feet = m * 3.28084;
  if (feet < 1000) return `About ${Math.max(50, Math.round(feet / 50) * 50)} ft away`;
  return `About ${(m / 1609.344).toFixed(1)} mi away`;
}

function timingReason(t: Timing, item: NormalizedRiskItem): string | null {
  switch (t.kind) {
    case "now":
      if (item.source === "md_road_closures") return "Closure is in effect now";
      if (item.source === "mdot_sha_projects") return "Under construction";
      return "Permit is active, so work may be underway";
    case "soon":
      return `Starts in ${t.days} day${t.days === 1 ? "" : "s"}`;
    case "later":
      return `Starts in about ${Math.round(t.days / 7)} weeks`;
    case "pending":
      return "Permit applied for but not issued yet";
    case "planning":
      return "Still in planning or design; construction hasn't started";
    case "on_hold":
      return "Project is on hold";
    case "unknown":
      return "In progress; the state hasn't published a phase or schedule";
  }
}

export function scoreItem(item: NormalizedRiskItem, distanceMeters: number, now = Date.now()): { level: RiskLevel; reasons: string[] } {
  if (item.category === "development_plan") {
    return {
      level: distanceMeters <= CLOSE_M ? "medium" : "low",
      reasons: [
        distanceMeters < 1 ? "Your address is inside this plan's area" : `${formatDistance(distanceMeters)} (to the plan's area)`,
        CATEGORY_REASON.development_plan,
        item.facts.planApproved ? "Plan approved, so construction may follow" : "Plan is still under county review",
      ],
    };
  }

  const t = timing(item, now);
  const major = MAJOR.includes(item.category);
  const cost = item.facts.costUsd ?? 0;
  const large = cost >= LARGE_COST_USD;
  const happening = t.kind === "now" || t.kind === "soon";

  const reasons = [formatDistance(distanceMeters), CATEGORY_REASON[item.category]];
  if (item.category === "road_closure" && item.facts.fullClosure) reasons[1] = "Full road closure";
  if (cost >= SIZABLE_COST_USD) {
    reasons.push(`${large ? "Large" : "Sizable"} project (reported cost $${Math.round(cost).toLocaleString("en-US")})`);
  }
  const tr = timingReason(t, item);
  if (tr) reasons.push(tr);

  let level: RiskLevel = "low";
  if (t.kind === "on_hold" || t.kind === "planning") {
    level = "low";
  } else if (
    (major && happening && distanceMeters <= NEAR_M) ||
    (item.category === "road_closure" && item.facts.fullClosure && happening && distanceMeters <= CLOSE_M) ||
    (item.category === "road_work" && t.kind === "now" && distanceMeters <= CLOSE_M)
  ) {
    level = "high";
  } else if (
    (major && distanceMeters <= MID_M) ||
    (item.category === "commercial_work" && cost >= SIZABLE_COST_USD && distanceMeters <= NEAR_M) ||
    (item.category === "commercial_work" && large && distanceMeters <= CLOSE_M)
  ) {
    level = "medium";
  }
  return { level, reasons };
}
