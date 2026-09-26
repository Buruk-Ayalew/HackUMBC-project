import type {
  BusinessProfile,
  LocalRiskResponse,
  RiskItem,
  RiskLevel,
  RiskSourceId,
  RiskSourceStatus,
} from "../../../../shared/types.js";
import { BALTIMORE_CITY, fetchBaltimoreCityPermits } from "./baltimoreCity.js";
import {
  BALTIMORE_COUNTY,
  BALTIMORE_COUNTY_DEV_PLANS,
  fetchBaltimoreCountyDevPlans,
  fetchBaltimoreCountyPermits,
} from "./baltimoreCounty.js";
import { cacheFile, withCache, type CachedResult } from "./cache.js";
import { fetchRoadClosures, fetchShaProjects, MD_ROAD_CLOSURES, MDOT_SHA_PROJECTS } from "./mdotSha.js";
import {
  normalizeCityPermits,
  normalizeCountyDevPlans,
  normalizeCountyPermits,
  normalizeRoadClosures,
  normalizeShaProjects,
  type NormalizedRiskItem,
} from "./normalize.js";
import { impactsFor } from "./impacts.js";
import { scoreItem } from "./score.js";
import { markSeen } from "./seen.js";
import { distanceMeters, distanceToPolygonMeters, locationKey } from "./util.js";

// Radius choices shown in the UI: 1/4, 1/2, and 1 mile.
export const RADIUS_OPTIONS_M = [402, 805, 1609] as const;
export const DEFAULT_RADIUS_M = 805;
// Always fetch at the largest radius so changing the radius never needs a new request.
const FETCH_RADIUS_M = 1609;

export interface SearchOptions {
  radiusMeters: number;
  force?: boolean; // "Check now": ignore the 12h freshness window
  userId?: string; // for "new nearby" tracking
}

interface SourcePlan {
  id: RiskSourceId;
  name: string;
  run: () => Promise<CachedResult>;
}

function planSources(profile: BusinessProfile, opts: SearchOptions): SourcePlan[] {
  const key = locationKey(profile.lat, profile.lng);
  const cacheOpts = { force: opts.force };
  const plans: SourcePlan[] = [];

  // Trust the GEOID-derived flag, never the mailing-city name.
  if (profile.jurisdiction.isBaltimoreCity) {
    plans.push({
      id: BALTIMORE_CITY.id,
      name: BALTIMORE_CITY.name,
      run: () =>
        withCache(cacheFile("baltimore-city"), key, cacheOpts, async () =>
          normalizeCityPermits(await fetchBaltimoreCityPermits(profile.lat, profile.lng, FETCH_RADIUS_M)),
        ),
    });
  } else if (profile.jurisdiction.county === "Baltimore County") {
    plans.push({
      id: BALTIMORE_COUNTY.id,
      name: BALTIMORE_COUNTY.name,
      run: () =>
        withCache(cacheFile("baltimore-county"), key, cacheOpts, async () =>
          normalizeCountyPermits(await fetchBaltimoreCountyPermits(profile.lat, profile.lng, FETCH_RADIUS_M)),
        ),
    });
    plans.push({
      id: BALTIMORE_COUNTY_DEV_PLANS.id,
      name: BALTIMORE_COUNTY_DEV_PLANS.name,
      run: () =>
        withCache(cacheFile("baltimore-county-dev-plans"), key, cacheOpts, async () =>
          normalizeCountyDevPlans(await fetchBaltimoreCountyDevPlans(profile.lat, profile.lng, FETCH_RADIUS_M)),
        ),
    });
  }

  // Statewide sources: one cached copy serves every address.
  plans.push(
    {
      id: MDOT_SHA_PROJECTS.id,
      name: MDOT_SHA_PROJECTS.name,
      run: () =>
        withCache(cacheFile("mdot-sha-projects"), "statewide", cacheOpts, async () =>
          normalizeShaProjects(await fetchShaProjects()),
        ),
    },
    {
      id: MD_ROAD_CLOSURES.id,
      name: MD_ROAD_CLOSURES.name,
      run: () =>
        withCache(cacheFile("md-road-closures"), "statewide", cacheOpts, async () => {
          const { active, planned } = await fetchRoadClosures();
          return [...normalizeRoadClosures(active, "active"), ...normalizeRoadClosures(planned, "planned")];
        }),
    },
  );
  return plans;
}

function coverageFor(profile: BusinessProfile): { coverage: "full" | "limited"; note: string } {
  const j = profile.jurisdiction;
  if (j.isBaltimoreCity) {
    return {
      coverage: "full",
      note: "Baltimore City building permits, state road projects, and road closures reported to the state.",
    };
  }
  if (j.county === "Baltimore County") {
    return {
      coverage: "full",
      note: "Baltimore County permits and development plans, state road projects, and road closures reported to the state.",
    };
  }
  return {
    coverage: "limited",
    note: `Coverage limited: for ${j.municipality ? `${j.municipality}, ${j.county}` : j.county} we only have state road projects and road closures reported to the state. Local building permits aren't available here yet.`,
  };
}

const LEVEL_ORDER: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };

export async function searchLocalRisk(profile: BusinessProfile, opts: SearchOptions): Promise<LocalRiskResponse> {
  const plans = planSources(profile, opts);
  const settled = await Promise.allSettled(plans.map((p) => p.run()));
  const now = Date.now();
  const center = { lat: profile.lat, lng: profile.lng };

  const sources: RiskSourceStatus[] = [];
  const byId = new Map<string, { item: NormalizedRiskItem; distance: number }>();

  settled.forEach((result, i) => {
    const plan = plans[i];
    const r: CachedResult =
      result.status === "fulfilled"
        ? result.value
        : { items: [], status: "unavailable", fetchedAt: null, message: "This source is unavailable right now." };
    if (result.status === "rejected") console.warn(`[risk] ${plan.id} failed:`, result.reason);

    for (const item of r.items) {
      const distance = item.facts.area ? distanceToPolygonMeters(center, item.facts.area) : distanceMeters(center, item);
      if (distance > FETCH_RADIUS_M) continue;
      // Drop closures/projects that have already ended.
      if (item.endDate && Date.parse(item.endDate) < now && item.source === "md_road_closures") continue;
      if (byId.has(item.id)) continue; // e.g. a planned closure that is now active
      byId.set(item.id, { item, distance });
    }
    sources.push({ source: plan.id, name: plan.name, status: r.status, fetchedAt: r.fetchedAt, itemCount: 0, message: r.message });
  });

  const newIds = opts.userId
    ? await markSeen(opts.userId, locationKey(profile.lat, profile.lng), [...byId.keys()])
    : new Set<string>();

  const items: RiskItem[] = [];
  for (const { item, distance } of byId.values()) {
    if (distance > opts.radiusMeters) continue;
    const { level, reasons } = scoreItem(item, distance, now);
    const { facts: _facts, ...rest } = item;
    items.push({
      ...rest,
      distanceMeters: Math.round(distance),
      riskLevel: level,
      riskReasons: reasons,
      impacts: impactsFor(item),
      isNew: newIds.has(item.id),
    });
  }
  items.sort((a, b) => LEVEL_ORDER[a.riskLevel] - LEVEL_ORDER[b.riskLevel] || a.distanceMeters - b.distanceMeters);

  // Per-source counts should reflect the chosen radius.
  for (const s of sources) s.itemCount = items.filter((it) => it.source === s.source).length;

  const { coverage, note } = coverageFor(profile);
  return {
    center: { ...center, address: profile.address },
    radiusMeters: opts.radiusMeters,
    items,
    sources,
    coverage,
    coverageNote: note,
    generatedAt: new Date().toISOString(),
  };
}
