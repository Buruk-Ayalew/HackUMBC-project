import type { BusinessProfile, ZoningInfo } from "../../../../../shared/types.js";
import { queryArcgis } from "../arcgis.js";
import { cacheFile, withCache } from "../cache.js";
import { locationKey } from "../util.js";

// Zoning district at the business address. Baltimore City and Baltimore County only;
// no statewide zoning layer exists. Fields verified 2026-09-26 via ?f=json.

const CITY = {
  name: "Baltimore City zoning map",
  layerUrl: "https://baltegis.baltimorecity.gov/mapping/rest/services/CityView/Zoning_New/FeatureServer/0",
  datasetUrl: "https://data.baltimorecity.gov/datasets/dc7bf04cec4e41ef85cc6b391652e1e7",
};

const COUNTY = {
  name: "Baltimore County zoning map",
  layerUrl: "https://bcgisdata.baltimorecountymd.gov/arcgis/rest/services/DevelopmentManagement/Zoning/MapServer/1",
  datasetUrl: "https://opendata.baltimorecountymd.gov/datasets/4e6b3a9b216d48fda5d3bec4b2670a8c",
};

const MAX_AGE_MS = 7 * 86_400_000; // zoning rarely changes

interface ZoningLookup {
  district: string | null;
  overlay: string | null;
  detailsUrl: string | null;
}

const NONE: ZoningLookup = { district: null, overlay: null, detailsUrl: null };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;

async function lookupCity(lat: number, lng: number): Promise<ZoningLookup> {
  const rows = await queryArcgis<{ Zoning: string | null; overlay: string | null; URL: string | null }>(CITY.layerUrl, {
    where: "1=1",
    outFields: ["Zoning", "overlay", "URL"],
    near: { lat, lng, radiusMeters: 0 },
    returnGeometry: false,
  });
  const a = rows[0]?.attributes;
  return a ? { district: clean(a.Zoning), overlay: clean(a.overlay), detailsUrl: clean(a.URL) } : NONE;
}

async function lookupCounty(lat: number, lng: number): Promise<ZoningLookup> {
  const rows = await queryArcgis<{ ZONE_CLASS: string | null; URL: string | null }>(COUNTY.layerUrl, {
    where: "1=1",
    outFields: ["ZONE_CLASS", "URL"],
    near: { lat, lng, radiusMeters: 0 },
    returnGeometry: false,
  });
  const a = rows[0]?.attributes;
  // The county publishes http:// links; the same host serves them over https (checked 2026-09-26).
  const url = clean(a?.URL)?.replace(/^http:\/\//, "https://") ?? null;
  return a ? { district: clean(a.ZONE_CLASS), overlay: null, detailsUrl: url } : NONE;
}

export async function getZoning(profile: BusinessProfile, force = false): Promise<ZoningInfo> {
  const j = profile.jurisdiction;
  const src = j.isBaltimoreCity ? CITY : j.county === "Baltimore County" ? COUNTY : null;
  if (!src) {
    return {
      ...NONE,
      status: "not_covered",
      sourceName: "",
      sourceUrl: "",
      fetchedAt: null,
      impacts: [],
      message: `Zoning isn't available for ${j.municipality ? `${j.municipality}, ${j.county}` : j.county} yet. Your local planning or zoning office can tell you your district.`,
    };
  }

  const lookup = src === CITY ? lookupCity : lookupCounty;
  const r = await withCache<ZoningLookup>(
    cacheFile(src === CITY ? "zoning-city" : "zoning-county"),
    locationKey(profile.lat, profile.lng),
    { force, maxAgeMs: MAX_AGE_MS, empty: NONE },
    () => lookup(profile.lat, profile.lng),
  );
  return {
    ...r.items,
    status: r.status,
    sourceName: src.name,
    sourceUrl: src.datasetUrl,
    fetchedAt: r.fetchedAt,
    impacts: r.items.district ? ["property_rules"] : [],
    message: r.message ?? (r.status === "live" && !r.items.district ? "No zoning district found at this exact point." : undefined),
  };
}
