import type { JurisdictionLookupResult } from "../../../shared/types.js";
import { politeFetchJson } from "./http.js";
import { dataPath, readJson, writeJson } from "./jsonStore.js";

// Address -> county / Baltimore City / municipality.
// 1. U.S. Census Geocoder (geographies endpoint): coordinates, county GEOID, incorporated place.
// 2. MD iMAP "Municipal Boundaries - Detailed" polygon layer: confirms the municipality.
//    Fields checked with ?f=json: MUN_NAME (upper case), JURSCODE, MUN_CODE.

const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const IMAP_MUNICIPAL_URL =
  "https://mdgeodata.md.gov/imap/rest/services/Boundaries/MD_PoliticalBoundaries/FeatureServer/5/query";

const BALTIMORE_CITY_GEOID = "24510";
const MARYLAND_FIPS = "24";

const CACHE_FILE = dataPath("cache", "geocode.json");

export class JurisdictionError extends Error {
  constructor(
    public code: "NO_MATCH" | "NOT_MARYLAND" | "UNAVAILABLE",
    message: string,
  ) {
    super(message);
  }
}

interface CensusGeography {
  GEOID: string;
  NAME: string;
  BASENAME: string;
  STATE: string;
}

interface CensusResponse {
  result: {
    addressMatches: {
      matchedAddress: string;
      coordinates: { x: number; y: number };
      geographies: Record<string, CensusGeography[] | undefined>;
    }[];
  };
}

interface ImapResponse {
  features?: { attributes: { MUN_NAME: string | null } }[];
  error?: { message: string };
}

type CacheEntry = JurisdictionLookupResult & { cachedAt: string };

export function normalizeAddress(address: string): string {
  return address.toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && ["of", "and", "the"].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

async function geocodeCensus(address: string) {
  const params = new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    layers: "all",
    format: "json",
  });
  const data = await politeFetchJson<CensusResponse>(`${CENSUS_URL}?${params}`, 20000);
  const match = data.result?.addressMatches?.[0];
  if (!match) {
    throw new JurisdictionError(
      "NO_MATCH",
      "We couldn't find that address. Check the street number, street name, city, and ZIP code.",
    );
  }
  const county = match.geographies["Counties"]?.[0];
  if (!county || !county.GEOID.startsWith(MARYLAND_FIPS)) {
    throw new JurisdictionError("NOT_MARYLAND", "RegWise currently covers Maryland addresses only.");
  }
  const isBaltimoreCity = county.GEOID === BALTIMORE_CITY_GEOID;
  const place = match.geographies["Incorporated Places"]?.[0];
  return {
    lat: match.coordinates.y,
    lng: match.coordinates.x,
    matchedAddress: match.matchedAddress,
    // Always trust the GEOID, never the city name in the mailing address.
    county: isBaltimoreCity ? "Baltimore City" : county.NAME,
    isBaltimoreCity,
    // Baltimore City is a county-level jurisdiction, not a municipality.
    censusMunicipality: isBaltimoreCity || !place ? null : place.BASENAME,
  };
}

// Returns the municipality name, null if outside any municipality, or
// undefined if the service could not be reached.
async function lookupImapMunicipality(lat: number, lng: number): Promise<string | null | undefined> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "MUN_NAME",
    returnGeometry: "false",
    f: "json",
  });
  try {
    const data = await politeFetchJson<ImapResponse>(`${IMAP_MUNICIPAL_URL}?${params}`);
    if (data.error || !data.features) return undefined;
    const name = data.features[0]?.attributes.MUN_NAME;
    if (!name || name.toUpperCase() === "BALTIMORE CITY") return null;
    return titleCase(name);
  } catch (err) {
    console.warn("MD iMAP municipal lookup failed:", (err as Error).message);
    return undefined;
  }
}

export async function lookupJurisdiction(address: string): Promise<JurisdictionLookupResult> {
  const key = normalizeAddress(address);
  const cache = await readJson<Record<string, CacheEntry>>(CACHE_FILE, {});

  let census: Awaited<ReturnType<typeof geocodeCensus>>;
  try {
    census = await geocodeCensus(address);
  } catch (err) {
    if (err instanceof JurisdictionError) throw err;
    const cached = cache[key];
    if (cached) {
      const { cachedAt, ...result } = cached;
      return {
        ...result,
        notes: [...result.notes, `Showing saved results from ${cachedAt.slice(0, 10)}.`],
      };
    }
    console.warn("Census geocoder failed:", (err as Error).message);
    throw new JurisdictionError(
      "UNAVAILABLE",
      "The address lookup service is not responding right now. Try again in a minute.",
    );
  }

  const notes: string[] = [];
  let confidence: JurisdictionLookupResult["confidence"] = "high";
  let municipality = census.censusMunicipality;
  let imapUnavailable = false;

  if (!census.isBaltimoreCity) {
    const imap = await lookupImapMunicipality(census.lat, census.lng);
    if (imap === undefined) {
      imapUnavailable = true;
      confidence = "check";
      notes.push("We couldn't reach the state's town boundary map, so please double-check the town.");
    } else if ((imap ?? "").toLowerCase() !== (municipality ?? "").toLowerCase()) {
      // The state's boundary map is more current than Census places.
      municipality = imap;
      confidence = "check";
      notes.push("Two boundary sources disagreed about your town. Please confirm it's right.");
    }
  }
  notes.push("Town boundaries come from MD iMAP and are not legal descriptions. Please confirm.");

  const result: JurisdictionLookupResult = {
    lat: census.lat,
    lng: census.lng,
    matchedAddress: census.matchedAddress,
    jurisdiction: {
      state: "MD",
      county: census.county,
      isBaltimoreCity: census.isBaltimoreCity,
      municipality,
    },
    confidence,
    notes,
  };

  // Re-read so concurrent lookups don't clobber each other's entries. Never
  // replace a complete saved result with one made while iMAP was down.
  const latest = await readJson<Record<string, CacheEntry>>(CACHE_FILE, {});
  if (!(imapUnavailable && latest[key])) {
    latest[key] = { ...result, cachedAt: new Date().toISOString() };
    await writeJson(CACHE_FILE, latest);
  }
  return result;
}
