import type { BusinessProfile, FloodInfo } from "../../../../../shared/types.js";
import { queryArcgis } from "../arcgis.js";
import { cacheFile, withCache } from "../cache.js";
import { locationKey } from "../util.js";

// FEMA flood zone at the address, plus high-risk zones nearby. Statewide.
// FEMA National Flood Hazard Layer, "Flood Hazard Zones" (layer 28). Verified 2026-09-26:
// returns X for the sample addresses and AE/VE where expected (Inner Harbor, OC bay side).

const LAYER_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28";
const SOURCE_NAME = "FEMA National Flood Hazard Layer";
export const NEARBY_FLOOD_M = 300;
const MAX_AGE_MS = 7 * 86_400_000; // flood maps change rarely

interface ZoneRow {
  FLD_ZONE: string | null;
  ZONE_SUBTY: string | null;
  SFHA_TF: string | null; // "T" = Special Flood Hazard Area (high risk)
}

interface FloodLookup {
  zone: string | null;
  subtype: string | null;
  highRisk: boolean | null;
  nearbyHighRiskZones: string[];
}

const NONE: FloodLookup = { zone: null, subtype: null, highRisk: null, nearbyHighRiskZones: [] };

// Plain-language summaries of FEMA's zone definitions.
export function describeZone(zone: string | null, subtype: string | null): string | null {
  if (!zone) return null;
  const z = zone.toUpperCase();
  const sub = (subtype ?? "").toUpperCase();
  if (z.startsWith("V")) return "High-risk coastal flood area, with added danger from storm waves.";
  if (z.startsWith("A")) return "High-risk flood area: at least a 1% chance of flooding each year (the \"100-year flood\").";
  if (z === "X" && sub.includes("0.2 PCT")) return "Moderate risk: about a 0.2% chance of flooding each year (the \"500-year flood\").";
  if (z === "X" && sub.includes("LEVEE")) return "Reduced flood risk because of a levee.";
  if (z === "X") return "Minimal flood hazard on FEMA's map.";
  if (z === "D") return "Flood risk hasn't been determined for this area.";
  return `FEMA flood zone ${zone}.`;
}

async function lookup(lat: number, lng: number): Promise<FloodLookup> {
  const here = await queryArcgis<ZoneRow>(LAYER_URL, {
    where: "1=1",
    outFields: ["FLD_ZONE", "ZONE_SUBTY", "SFHA_TF"],
    near: { lat, lng, radiusMeters: 0 },
    returnGeometry: false,
  });
  const nearby = await queryArcgis<ZoneRow>(LAYER_URL, {
    where: "SFHA_TF = 'T'",
    outFields: ["FLD_ZONE"],
    near: { lat, lng, radiusMeters: NEARBY_FLOOD_M },
    returnGeometry: false,
  });
  // If the point sits on a boundary, prefer the higher-risk polygon.
  const rows = here.map((f) => f.attributes).sort((a, b) => Number(b.SFHA_TF === "T") - Number(a.SFHA_TF === "T"));
  const a = rows[0];
  const zones = [...new Set(nearby.map((f) => f.attributes.FLD_ZONE).filter((z): z is string => !!z))].sort();
  return {
    zone: a?.FLD_ZONE ?? null,
    subtype: a?.ZONE_SUBTY ?? null,
    highRisk: a ? a.SFHA_TF === "T" : null,
    nearbyHighRiskZones: zones,
  };
}

export async function getFlood(profile: BusinessProfile, force = false): Promise<FloodInfo> {
  const r = await withCache<FloodLookup>(
    cacheFile("flood"),
    locationKey(profile.lat, profile.lng),
    { force, maxAgeMs: MAX_AGE_MS, empty: NONE },
    () => lookup(profile.lat, profile.lng),
  );
  const f = r.items;
  return {
    zone: f.zone,
    zoneDescription: describeZone(f.zone, f.subtype),
    highRisk: f.highRisk,
    nearbyHighRiskZones: f.nearbyHighRiskZones,
    nearbyMeters: NEARBY_FLOOD_M,
    status: r.status,
    sourceName: SOURCE_NAME,
    // FEMA's official lookup for this address.
    sourceUrl: `https://msc.fema.gov/portal/search?AddressQuery=${encodeURIComponent(profile.address)}`,
    fetchedAt: r.fetchedAt,
    message: r.message ?? (r.status === "live" && !f.zone ? "FEMA has no flood map data at this exact point." : undefined),
  };
}
