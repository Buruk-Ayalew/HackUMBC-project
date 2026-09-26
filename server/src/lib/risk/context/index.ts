import type { BusinessProfile, LocalContextResponse } from "../../../../../shared/types.js";
import { getCompetitors } from "./competitors.js";
import { getFlood } from "./flood.js";
import { getZoning } from "./zoning.js";

// Location context for Local Risk: zoning, flood zone, and nearby competitors.
// Each section fails on its own; one broken source never hides the others.

export async function getLocalContext(
  profile: BusinessProfile,
  opts: { radiusMeters: number; force?: boolean },
): Promise<LocalContextResponse> {
  const [zoning, flood, competitors] = await Promise.allSettled([
    getZoning(profile, opts.force),
    getFlood(profile, opts.force),
    getCompetitors(profile, opts.radiusMeters, opts.force),
  ]);
  const down = { status: "unavailable" as const, fetchedAt: null, message: "This source is unavailable right now.", impacts: [] };
  for (const r of [zoning, flood, competitors]) if (r.status === "rejected") console.warn("[risk/context]", r.reason);

  return {
    zoning:
      zoning.status === "fulfilled"
        ? zoning.value
        : { ...down, sourceName: "", sourceUrl: "", district: null, overlay: null, detailsUrl: null },
    flood:
      flood.status === "fulfilled"
        ? flood.value
        : { ...down, sourceName: "FEMA National Flood Hazard Layer", sourceUrl: "https://msc.fema.gov/portal/search", zone: null, zoneDescription: null, highRisk: null, nearbyHighRiskZones: [], nearbyMeters: 0 },
    competitors:
      competitors.status === "fulfilled"
        ? competitors.value
        : { ...down, sourceName: "OpenStreetMap contributors", sourceUrl: "https://www.openstreetmap.org/copyright", label: null, radiusMeters: opts.radiusMeters, items: [] },
    generatedAt: new Date().toISOString(),
  };
}
