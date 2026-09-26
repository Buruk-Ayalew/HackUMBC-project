import type { ImpactTag, RiskCategory } from "../../../../shared/types.js";
import type { NormalizedRiskItem } from "./normalize.js";
import { SIZABLE_COST_USD } from "./score.js";

// Impact tags: how a nearby item could affect a business, in general terms.
// Rules only use the item's type and facts reported by the source. Distance and
// timing are already covered by the risk level, so tags describe the kind of
// effect, not how strong it is. The general blurb for each tag lives in the
// client (client/src/components/localRisk/format.ts).

const BY_CATEGORY: Record<RiskCategory, ImpactTag[]> = {
  road_closure: ["access_parking"],
  road_work: ["access_parking"],
  demolition: ["noise_dust", "access_parking"],
  new_construction: ["noise_dust", "access_parking", "future_development"],
  site_work: ["noise_dust", "access_parking"],
  commercial_work: [], // decided by size below
  residential_work: ["minor_activity"],
  development_plan: ["future_development"],
  other: ["minor_activity"],
};

export function impactsFor(item: NormalizedRiskItem): ImpactTag[] {
  if (item.category === "commercial_work") {
    // Only sizable jobs (reported cost $100k+) are likely to be noticed next door.
    return (item.facts.costUsd ?? 0) >= SIZABLE_COST_USD ? ["noise_dust"] : ["minor_activity"];
  }
  return BY_CATEGORY[item.category];
}
