import type { BusinessProfile, Competitor, CompetitorInfo } from "../../../../../shared/types.js";
import { HttpError, politeFetchJson } from "../../http.js";
import { cacheFile, withCache } from "../cache.js";
import { distanceMeters, locationKey } from "../util.js";

// Nearby businesses of the same type, from OpenStreetMap via the Overpass API.
// Statewide but crowd-sourced, so it can be incomplete. Overpass allows only 2
// concurrent requests per IP (checked 2026-09-26), so we cache for 24 hours and
// politeFetch runs requests to the host one at a time.

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const SOURCE_NAME = "OpenStreetMap contributors";
const SOURCE_URL = "https://www.openstreetmap.org/copyright";
const FETCH_RADIUS_M = 1609; // fetch once at 1 mile, filter to the chosen radius
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Only business types with a clear OpenStreetMap match. Retail, professional
// services, contractors, healthcare, and manufacturing are too broad to call competitors.
const TYPES: Record<string, { label: string; filter: string }> = {
  restaurant: { label: "restaurants, cafés, and bars", filter: '["amenity"~"^(restaurant|fast_food|cafe|bar|pub)$"]' },
  food_truck: { label: "restaurants and fast-food places", filter: '["amenity"~"^(restaurant|fast_food)$"]' },
  salon: { label: "hair and beauty salons", filter: '["shop"~"^(hairdresser|beauty)$"]' },
  hotel: { label: "hotels, motels, and guest houses", filter: '["tourism"~"^(hotel|motel|guest_house|hostel)$"]' },
  childcare: { label: "childcare centers and preschools", filter: '["amenity"~"^(childcare|kindergarten)$"]' },
};

const KIND_LABEL: Record<string, string> = {
  restaurant: "Restaurant",
  fast_food: "Fast food",
  cafe: "Café",
  bar: "Bar",
  pub: "Pub",
  hairdresser: "Hair salon",
  beauty: "Beauty salon",
  hotel: "Hotel",
  motel: "Motel",
  guest_house: "Guest house",
  hostel: "Hostel",
  childcare: "Childcare",
  kindergarten: "Preschool",
};

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
  remark?: string; // set when the query timed out or failed part-way
}

// Cached at 1 mile without distances; each request filters to its own radius.
type Place = Omit<Competitor, "distanceMeters">;

// Overpass answers 429 (rate limit) or 504 (server busy) under load and asks
// clients to try again later. Retry once after a pause; otherwise fall back to cache.
async function fetchOverpass(url: string): Promise<OverpassResponse> {
  try {
    return await politeFetchJson<OverpassResponse>(url, 40000);
  } catch (err) {
    if (!(err instanceof HttpError) || (err.status !== 429 && err.status !== 504)) throw err;
    await new Promise((r) => setTimeout(r, 5000));
    return politeFetchJson<OverpassResponse>(url, 40000);
  }
}

async function fetchPlaces(lat: number, lng: number, filter: string): Promise<Place[]> {
  const query = `[out:json][timeout:25];nwr(around:${FETCH_RADIUS_M},${lat},${lng})${filter};out center tags;`;
  const res = await fetchOverpass(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`);
  if (res.remark && /error|timed out/i.test(res.remark)) throw new Error(`Overpass: ${res.remark}`);
  const places: Place[] = [];
  for (const e of res.elements ?? []) {
    const plat = e.lat ?? e.center?.lat;
    const plng = e.lon ?? e.center?.lon;
    if (plat == null || plng == null) continue;
    const t = e.tags ?? {};
    const kindKey = t.amenity ?? t.shop ?? t.tourism ?? "";
    places.push({
      id: `osm:${e.type}/${e.id}`,
      name: t.name?.trim() || null,
      kind: KIND_LABEL[kindKey] ?? "Business",
      lat: plat,
      lng: plng,
      sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
    });
  }
  return places;
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function getCompetitors(profile: BusinessProfile, radiusMeters: number, force = false): Promise<CompetitorInfo> {
  const type = TYPES[profile.industry];
  if (!type) {
    return {
      status: "not_covered",
      sourceName: SOURCE_NAME,
      sourceUrl: SOURCE_URL,
      fetchedAt: null,
      impacts: [],
      label: null,
      radiusMeters,
      items: [],
      message:
        "We can't match competitors for this type of business yet. It works for restaurants, food trucks, salons, hotels, and childcare.",
    };
  }

  const r = await withCache<Place[]>(
    cacheFile("competitors"),
    `${profile.industry}:${locationKey(profile.lat, profile.lng)}`,
    { force, maxAgeMs: MAX_AGE_MS, empty: [] },
    () => fetchPlaces(profile.lat, profile.lng, type.filter),
  );

  const self = normName(profile.businessName);
  const center = { lat: profile.lat, lng: profile.lng };
  const items: Competitor[] = r.items
    .filter((p) => !(p.name && self && normName(p.name) === self)) // don't list the business itself
    .map((p) => ({ ...p, distanceMeters: Math.round(distanceMeters(center, p)) }))
    .filter((p) => p.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    // OSM often maps one place twice (a point and a building outline): keep the
    // closer one when the same name appears within 150 m.
    .filter((p, i, all) => !p.name || !all.slice(0, i).some((q) => q.name && normName(q.name) === normName(p.name!) && distanceMeters(q, p) < 150));

  return {
    status: r.status,
    sourceName: SOURCE_NAME,
    sourceUrl: SOURCE_URL,
    fetchedAt: r.fetchedAt,
    impacts: items.length > 0 ? ["competition"] : [],
    label: type.label,
    radiusMeters,
    items,
    message: r.message,
  };
}
