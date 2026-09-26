import type { RiskCategory, RiskItem } from "../../../../shared/types.js";
import type { ArcgisFeature } from "./arcgis.js";
import { BALTIMORE_CITY, type CityPermit } from "./baltimoreCity.js";
import type { ArcgisPolygon } from "./arcgis.js";
import { BALTIMORE_COUNTY, BALTIMORE_COUNTY_DEV_PLANS, type CountyDevPlan, type CountyPermit } from "./baltimoreCounty.js";
import { MD_ROAD_CLOSURES, MDOT_SHA_PROJECTS, type RoadClosure, type ShaProject } from "./mdotSha.js";
import { epochToDate, epochToIso, excerpt, polygonMarker, titleCase } from "./util.js";

// A RiskItem before it's placed relative to a business (no distance, level, impact tags, or "new" flag).
export type NormalizedRiskItem = Omit<RiskItem, "distanceMeters" | "riskLevel" | "riskReasons" | "impacts" | "isNew"> & {
  // Facts from the source that scoring uses. Never shown as numbers we invented.
  facts: {
    costUsd?: number; // as reported on the permit
    phase?: string; // SHA project phase
    onHold?: boolean;
    fullClosure?: boolean; // road closed in all directions
    notYetIssued?: boolean; // permit applied for, not issued
    planApproved?: boolean; // development plan approved (vs. under review)
    area?: [number, number][][]; // polygon rings [lng, lat]; distance is measured to this area
  };
};

function hasPoint<A>(f: ArcgisFeature<A>): f is ArcgisFeature<A> & { geometry: { x: number; y: number } } {
  return !!f.geometry && Number.isFinite(f.geometry.x) && Number.isFinite(f.geometry.y);
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

// ---------- Baltimore City ----------

// Case number prefixes seen in the data. COM is the older (pre-2024) commercial prefix.
const CITY_PREFIX_LABEL: Record<string, string> = {
  BCCM: "Commercial building permit",
  COM: "Commercial building permit",
  BRCM: "Residential building permit",
  BDEM: "Demolition permit",
  BTEMP: "Temporary structure permit",
};

const cityPrefix = (p: CityPermit) => clean(p.CaseNumber).match(/^[A-Z]+/)?.[0] ?? "";

// Some older records include city, state, and ZIP in the address.
const stripCityZip = (a: string) => a.replace(/,?\s+Baltimore(,?\s+(Maryland|MD))?(\s+[\d-]+)?$/i, "");

export function cityCategory(p: CityPermit): RiskCategory {
  const prefix = cityPrefix(p);
  const text = `${clean(p.PermitName)} ${clean(p.Description)}`.toLowerCase();
  if (prefix === "BDEM" || /\b(raze|razing)\b/.test(text)) return "demolition";
  if (/\b(new construction|(construct|erect|build)(ion of)? (a )?new (\d+[- ]story )?(building|structure|dwelling|house|home))\b/.test(text)) {
    return "new_construction";
  }
  if (/\b(grading|excavation|site ?work|storm ?water management)\b/.test(text)) return "site_work";
  if (prefix === "BCCM" || prefix === "COM") return "commercial_work";
  if (prefix === "BRCM") return "residential_work";
  return "other";
}

export function normalizeCityPermits(features: ArcgisFeature<CityPermit>[]): NormalizedRiskItem[] {
  return features.filter(hasPoint).map((f) => {
    const p = f.attributes;
    const address = clean(p.Address) ? titleCase(stripCityZip(clean(p.Address))) : null;
    const kind = CITY_PREFIX_LABEL[cityPrefix(p)] ?? "Building permit";
    return {
      id: `${BALTIMORE_CITY.id}:${p.CaseNumber ?? p.OBJECTID}`,
      source: BALTIMORE_CITY.id,
      sourceName: BALTIMORE_CITY.name,
      sourceUrl: BALTIMORE_CITY.datasetUrl,
      title: address ? `${kind} at ${address}` : kind,
      description: excerpt(p.Description),
      category: cityCategory(p),
      address,
      lat: f.geometry.y,
      lng: f.geometry.x,
      startDate: epochToDate(p.IssuedDate),
      endDate: epochToDate(p.ExpirationDate),
      dateNote: "Dates are when the permit was issued and when it expires, not exact work dates.",
      status: "Issued",
      reference: p.CaseNumber ?? undefined,
      facts: { costUsd: typeof p.Cost === "number" && p.Cost > 0 ? p.Cost : undefined },
    };
  });
}

// ---------- Baltimore County ----------

export function countyCategory(p: CountyPermit): RiskCategory {
  const type = clean(p.TYPEDESCRIPTION).toLowerCase();
  const sub = clean(p.SUBTYPE_DESCRIPTION).toLowerCase();
  if (type.includes("razing")) return "demolition";
  if (type.includes("environmental") || /grading|storm water/.test(sub)) return "site_work";
  if (sub.includes("new dwelling") || sub.includes("new structure") || sub.includes("new building")) return "new_construction";
  if ((type === "commercial new" || type === "commercial addition") && !sub) return "new_construction";
  if (type.startsWith("commercial")) return "commercial_work";
  if (type.startsWith("residential")) return "residential_work";
  return "other";
}

// The county joins the street suffix onto the name ("7946  HARFORDRD"). Split common
// suffixes back off for display. WAY is left out so "BROADWAY" stays intact.
const countyAddress = (a: string) => a.replace(/(?<=[A-Z]{3})(RD|DR|AVE|ST|LN|CT|BLVD|PL|TER|CIR|PKWY|HWY)$/, " $1");

export function normalizeCountyPermits(features: ArcgisFeature<CountyPermit>[]): NormalizedRiskItem[] {
  return features.filter(hasPoint).map((f) => {
    const p = f.attributes;
    const address = clean(p.P_ADDRESS) ? titleCase(countyAddress(clean(p.P_ADDRESS))) : null;
    const kind = [clean(p.TYPEDESCRIPTION), clean(p.SUBTYPE_DESCRIPTION)].filter(Boolean).join(": ") || "Permit";
    const issued = p.STATUS === "ISSUE";
    const cost = Number.parseFloat(p.EST_COST ?? "");
    return {
      id: `${BALTIMORE_COUNTY.id}:${p.PERMITNO ?? p.OBJECTID}`,
      source: BALTIMORE_COUNTY.id,
      sourceName: BALTIMORE_COUNTY.name,
      sourceUrl: BALTIMORE_COUNTY.datasetUrl,
      title: address ? `${kind} at ${address}` : kind,
      description: excerpt(p.DESC_WORK),
      category: countyCategory(p),
      address,
      lat: f.geometry.y,
      lng: f.geometry.x,
      startDate: epochToDate(issued ? p.ISSDATE : p.APPL_DATE),
      endDate: null,
      dateNote: issued ? "Date is when the permit was issued." : "Applied for; not issued yet.",
      status: issued ? "Issued" : "Applied, not yet issued",
      reference: p.PERMITNO ?? undefined,
      facts: { costUsd: cost > 0 ? cost : undefined, notYetIssued: !issued },
    };
  });
}

// ---------- Baltimore County development plans ----------

// DEV_TRACK values seen 2026-09-26: MAJOR, MINOR (and typo MNOR), LIMITED, PUD, OTHER, UNKNOWN.
// Labels stay close to the county's own track names.
const DEV_TRACK_LABEL: Record<string, string> = {
  MAJOR: "Major-track",
  MINOR: "Minor-track",
  MNOR: "Minor-track",
  LIMITED: "Limited-track",
  PUD: "Planned unit development",
};

export function normalizeCountyDevPlans(features: ArcgisFeature<CountyDevPlan, ArcgisPolygon>[]): NormalizedRiskItem[] {
  const out: NormalizedRiskItem[] = [];
  for (const f of features) {
    const rings = f.geometry?.rings;
    const marker = rings ? polygonMarker(rings) : null;
    if (!rings || !marker) continue;
    const p = f.attributes;
    const approved = clean(p.PLAN_APPROVED).toUpperCase() === "YES";
    const track = clean(p.DEV_TRACK).toUpperCase();
    const trackLabel = DEV_TRACK_LABEL[track] ?? null;
    const name = clean(p.PROJECT_NAME) ? titleCase(clean(p.PROJECT_NAME)) : null;
    const pdf = clean(p.WEB_PLANS_URL);
    out.push({
      id: `${BALTIMORE_COUNTY_DEV_PLANS.id}:${p.PAI_NO ?? p.OBJECTID}`,
      source: BALTIMORE_COUNTY_DEV_PLANS.id,
      sourceName: BALTIMORE_COUNTY_DEV_PLANS.name,
      sourceUrl: pdf.startsWith("http") ? pdf : BALTIMORE_COUNTY_DEV_PLANS.datasetUrl,
      title: name ? `Development plan: ${name}` : `Development plan ${p.PAI_NO ?? ""}`.trim(),
      description: [
        trackLabel ? `${trackLabel} development plan` : "Development plan",
        clean(p.RESIDENTIAL).toUpperCase() === "YES" ? "includes housing" : null,
      ]
        .filter(Boolean)
        .join(", ") + (pdf.startsWith("http") ? ". See the plan PDF for details." : "."),
      category: "development_plan",
      address: null,
      lat: marker.lat,
      lng: marker.lng,
      startDate: null,
      endDate: null,
      dateNote: "The county doesn't publish a construction schedule for plans. Distance is to the edge of the plan's area.",
      status: approved ? "Plan approved" : "Plan under review",
      reference: p.PAI_NO ? `Project ${p.PAI_NO}` : undefined,
      facts: { planApproved: approved, area: rings },
    });
  }
  return out;
}

// ---------- MDOT SHA projects ----------

const NO_PORTAL = /No-Project-Portal/i;
const blankish = (s: string | null | undefined) => !clean(s) || /^(n\/?a|tbd|none)$/i.test(clean(s));

export function normalizeShaProjects(features: ArcgisFeature<ShaProject>[]): NormalizedRiskItem[] {
  return features.filter(hasPoint).map((f) => {
    const p = f.attributes;
    const phase = blankish(p.Phase) ? undefined : clean(p.Phase);
    const start = epochToDate(p.Estimated_Project_Start_Year);
    const end = epochToDate(p.Estimated_Project_Completion_Ye);
    const season = (s: string | null, d: string | null) =>
      [blankish(s) ? "" : clean(s), d ? d.slice(0, 4) : ""].filter(Boolean).join(" ");
    const startLabel = season(p.Estimated_Start_Season, start);
    const endLabel = season(p.Estimated_Completion_Season, end);
    const dateNote =
      startLabel || endLabel
        ? `State estimate: ${[startLabel && `starts ${startLabel}`, endLabel && `finishes ${endLabel}`].filter(Boolean).join(", ")}.`
        : "No schedule published.";
    const portal = clean(p.Project_Portal_URL);
    const description = !blankish(p.What_to_Expect) ? p.What_to_Expect : !blankish(p.Work_Type) ? p.Work_Type : "";
    return {
      id: `${MDOT_SHA_PROJECTS.id}:${p.OBJECTID}`,
      source: MDOT_SHA_PROJECTS.id,
      sourceName: MDOT_SHA_PROJECTS.name,
      sourceUrl: portal.startsWith("http") && !NO_PORTAL.test(portal) ? portal : MDOT_SHA_PROJECTS.datasetUrl,
      title: clean(p.Project_Name) || "State road project",
      description: excerpt(description),
      category: "road_work",
      address: blankish(p.Location) ? null : clean(p.Location),
      lat: f.geometry.y,
      lng: f.geometry.x,
      startDate: start,
      endDate: end,
      dateNote: `${dateNote} Map point marks the project's reference location; the work may stretch along the road.`,
      status: [clean(p.Project_Status), phase && `${phase} phase`].filter(Boolean).join(", ") || null,
      facts: { phase, onHold: clean(p.Project_Status) === "On Hold" },
    };
  });
}

// ---------- Road closures ----------

const INDEFINITE_MS = 5 * 365 * 86_400_000;

export function normalizeRoadClosures(
  features: ArcgisFeature<RoadClosure>[],
  layer: "active" | "planned",
): NormalizedRiskItem[] {
  return features.filter(hasPoint).map((f) => {
    const c = f.attributes;
    const road = clean(c.RoadName) ? titleCase(clean(c.RoadName)) : "Road";
    const cross = [clean(c.CrossStreet1), clean(c.CrossStreet2)].filter(Boolean).map(titleCase);
    const indefinite = c.ClosureEnd != null && c.ClosureEnd - Date.now() > INDEFINITE_MS;
    const reason = clean(c.typeSummary);
    return {
      id: `${MD_ROAD_CLOSURES.id}:${c.RC_GUID ?? `${layer}-${c.OBJECTID}`}`,
      source: MD_ROAD_CLOSURES.id,
      sourceName: MD_ROAD_CLOSURES.name,
      sourceUrl: layer === "active" ? MD_ROAD_CLOSURES.activeDatasetUrl : MD_ROAD_CLOSURES.plannedDatasetUrl,
      title: `${road}: ${clean(c.ClosureType) || "Closure"}${reason ? ` (${reason})` : ""}`,
      description: excerpt([clean(c.ClosureSummary), clean(c.Comments)].filter(Boolean).join(" ")),
      category: "road_closure",
      address: cross.length === 2 ? `${road} between ${cross[0]} and ${cross[1]}` : cross.length === 1 ? `${road} at ${cross[0]}` : road,
      lat: f.geometry.y,
      lng: f.geometry.x,
      startDate: epochToIso(c.ClosureStart),
      endDate: indefinite ? null : epochToIso(c.ClosureEnd),
      dateNote: indefinite ? "No end date announced." : undefined,
      status: layer === "active" ? "Active" : "Planned",
      reference: clean(c.Jurisdiction) ? `Reported by ${titleCase(clean(c.Jurisdiction))}` : undefined,
      facts: { fullClosure: clean(c.ClosureType).toLowerCase() === "closed" },
    };
  });
}
