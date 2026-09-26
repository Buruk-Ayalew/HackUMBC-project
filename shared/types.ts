// Types shared by the server AND the client.
// BusinessProfile is the contract between modules: do not change its shape
// without team agreement.

export type EntityType =
  | "sole_prop"
  | "general_partnership"
  | "llc"
  | "corporation"
  | "lp"
  | "llp"
  | "nonprofit"
  | "other";

export interface BusinessProfile {
  id: string;
  userId: string;
  businessName: string;
  address: string; // as entered
  lat: number; // from Census geocoder
  lng: number;
  jurisdiction: {
    state: "MD";
    county: string; // e.g. "Baltimore County", "Montgomery County"
    isBaltimoreCity: boolean; // Baltimore City is its own jurisdiction, not part of Baltimore County
    municipality: string | null; // incorporated town/city, e.g. "Annapolis", or null
  };
  entityType: EntityType;
  industry: string; // plain-language category, e.g. "restaurant", "retail", "salon", "contractor", "hotel"
  naicsCode?: string; // optional, internal only
  employees: {
    totalAllStates: number; // everyone under the tax ID, all states (FAMLI)
    inMaryland: number; // employees working in Maryland (sick leave, parental leave)
    fullTimeInMaryland: number; // full-time in Maryland (state ban-the-box)
    coveredByFMLA: "yes" | "no" | "unsure";
  };
  flags: {
    tippedEmployees: boolean;
    sellsTaxableGoods: boolean;
    chargesAdmission: boolean;
    rentsLodging: boolean;
    servesAlcohol: boolean;
    sellsToGovernment: boolean;
    handlesCustomerData: boolean;
  };
  updatedAt: string; // ISO date
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

// ---------- Jurisdiction lookup ----------

export interface JurisdictionLookupResult {
  lat: number;
  lng: number;
  matchedAddress: string;
  jurisdiction: BusinessProfile["jurisdiction"];
  // "high": Census and MD iMAP agree. "check": they disagree or iMAP was
  // unavailable, so the user should confirm.
  confidence: "high" | "check";
  notes: string[];
}

// ---------- Obligations ----------

export type ObligationCategory =
  | "employment"
  | "tax"
  | "registration"
  | "licensing"
  | "posting"
  | "privacy";

export type Condition =
  | { field: string; op: "gte" | "lte" | "eq" | "between"; value: number | [number, number] }
  | { field: string; op: "is"; value: boolean | string }
  | { field: string; op: "in" | "not_in"; value: string[] }
  | { field: "jurisdiction"; op: "match" };

export interface ObligationRule {
  id: string;
  title: string;
  category: ObligationCategory;
  jurisdiction: { level: "federal" | "state" | "county" | "municipality"; name?: string };
  conditions: Condition[]; // ALL must pass for "affects"
  mightConditions?: Condition[]; // if these pass but conditions don't, result is "might"
  // Status when all conditions pass (default "affects"). Use "might" for items
  // we can't decide from the profile, "not_applicable" for things like BOI.
  statusWhenMet?: "affects" | "might" | "not_applicable";
  // summary and action may use {{placeholders}} filled from local data,
  // e.g. {{county}}, {{municipality}}, {{admissionsRate}}, {{hotelRate}}.
  summary: string;
  action: string;
  deadlines?: { label: string; date: string }[]; // one-time ISO dates
  // Filing schedule details (used by the filing schedule table and calendar).
  agency?: string; // who you file with, e.g. "Comptroller of Maryland"
  frequency?: ObligationFrequency;
  frequencyNote?: string; // e.g. "Monthly if you withhold more than $700 a quarter"
  recurring?: RecurringSchedule;
  filingUrl?: string; // where the filing or payment is actually done
  filingSiteName?: string;
  // Key facts that must appear on the source page; re-checked live.
  verify?: string[];
  sourceUrl: string;
  sourceName: string;
  reviewedOn: string; // ISO date
}

export type ObligationFrequency =
  | "once"
  | "ongoing"
  | "every_payroll"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "every_2_years"
  | "varies";

// A repeating due date. Dates that land on a weekend or federal holiday move
// to the next business day.
//  - month:   due on `day` of the month after each month
//  - quarter: due on `day` of the month after each calendar quarter
//  - year:    due every year on `month`/`day`
export interface RecurringSchedule {
  every: "month" | "quarter" | "year";
  day: number | "last";
  month?: number; // 1-12, for "year"
  label: string; // e.g. "Sales and use tax return ({period})"
  startsOn?: string; // no due dates before this ISO date
}

export interface ObligationResult {
  rule: ObligationRule;
  status: "affects" | "might" | "not_applicable";
  reasons: string[];
  coverage: "reviewed" | "limited";
  coverageNote?: string;
  // Due dates in the next 12 months (one-time deadlines + recurring), sorted.
  upcoming: DueDate[];
  // Result of the live check of this rule against its official source page.
  verification?: RuleVerification;
  // Live sources (LiveSourceStatus ids) whose values appear in this item's text.
  valueSources?: string[];
}

export interface RuleVerification {
  // verified: every key fact was found on the official page just now
  // changed:  the page no longer says one of them (needs human review)
  // saved:    the page is unreachable; showing the last successful check
  // unavailable: never reached
  status: "verified" | "changed" | "saved" | "unavailable";
  checkedAt: string;
  missing?: string[];
  error?: string;
}

// A live data source used by the obligations module.
export interface LiveSourceStatus {
  id: string;
  name: string;
  url: string;
  status: "live" | "saved" | "unavailable";
  fetchedAt: string | null;
  error?: string;
}

export interface DueDate {
  date: string; // YYYY-MM-DD, already moved off weekends/holidays
  label: string;
}

// What changes at one employee-count milestone on the growth planner.
export interface Milestone {
  employees: number; // Maryland headcount on the single-slider scale
  counts: { totalAllStates: number; inMaryland: number; fullTimeInMaryland: number };
  changes: { ruleId: string; title: string; from: ObligationResult["status"]; to: ObligationResult["status"]; reason: string }[];
}

// GET /api/obligations and POST /api/obligations/what-if
export interface ObligationsResponse {
  results: ObligationResult[];
  // Profile-level notes about what we have NOT reviewed for this location.
  coverageNotes: string[];
  // Employee counts where some rule changes, from rules' numeric conditions.
  thresholds: number[];
  evaluatedAt: string;
  sources: LiveSourceStatus[];
  liveRefreshedAt: string | null;
  refreshing: boolean;
}

// ---------- Local Risk ----------

export type RiskSourceId =
  | "baltimore_city_permits"
  | "baltimore_county_permits"
  | "baltimore_county_dev_plans"
  | "mdot_sha_projects"
  | "md_road_closures";

export type RiskCategory =
  | "road_closure"
  | "road_work"
  | "demolition"
  | "new_construction"
  | "site_work" // grading, storm water, sitework
  | "commercial_work" // alterations, fit-outs, change of use
  | "residential_work"
  | "development_plan" // proposed or approved development, not yet construction
  | "other";

export type RiskLevel = "high" | "medium" | "low";

export interface RiskItem {
  id: string; // `${source}:${native id}`, stable across refreshes
  source: RiskSourceId;
  sourceName: string;
  sourceUrl: string; // official page for this item or its dataset
  title: string;
  description: string; // short excerpt from the source record
  category: RiskCategory;
  address: string | null;
  lat: number;
  lng: number;
  distanceMeters: number; // straight-line distance from the business
  startDate: string | null; // YYYY-MM-DD (or ISO datetime for road closures)
  endDate: string | null;
  dateNote?: string; // what the dates mean, e.g. "State estimate: starts Spring 2026."
  status: string | null; // as reported by the source, e.g. "Issued", "In Progress"
  reference?: string; // permit / case number or reporting agency
  riskLevel: RiskLevel; // rule-based estimate (distance, type, timing)
  riskReasons: string[];
  isNew: boolean; // first seen for this location within the last 7 days
}

export interface RiskSourceStatus {
  source: RiskSourceId;
  name: string;
  // live: fetched just now or within the refresh window. cached: live fetch failed,
  // showing saved results. unavailable: no live data and no cache.
  status: "live" | "cached" | "unavailable";
  fetchedAt: string | null; // ISO
  itemCount: number;
  message?: string;
}

export interface LocalRiskResponse {
  center: { lat: number; lng: number; address: string };
  radiusMeters: number;
  items: RiskItem[]; // sorted: level, then distance
  sources: RiskSourceStatus[];
  coverage: "full" | "limited";
  coverageNote: string;
  generatedAt: string;
}

export interface LocalRiskNewCount {
  newCount: number;
  highCount: number;
}

// ---------- Local Risk: location context (GET /api/local-risk/context) ----------

// Where a context section's data came from and how fresh it is.
export interface ContextSource {
  // not_covered: we have no source for this location or business type.
  status: "live" | "cached" | "unavailable" | "not_covered";
  sourceName: string;
  sourceUrl: string; // official dataset or lookup page
  fetchedAt: string | null; // ISO
  message?: string; // e.g. "Showing saved results from 2026-09-26."
}

export interface ZoningInfo extends ContextSource {
  district: string | null; // as published, e.g. "C-1-E", "BL"
  overlay: string | null; // e.g. "W-1"
  detailsUrl: string | null; // official PDF describing the district
}

export interface FloodInfo extends ContextSource {
  zone: string | null; // FEMA zone at the address, e.g. "X", "AE", "VE"
  zoneDescription: string | null; // plain-language meaning of the zone
  highRisk: boolean | null; // in a FEMA Special Flood Hazard Area
  nearbyHighRiskZones: string[]; // high-risk zones within NEARBY_FLOOD_M, e.g. ["AE", "VE"]
  nearbyMeters: number;
}

export interface Competitor {
  id: string; // e.g. "osm:node/123"
  name: string | null;
  kind: string; // e.g. "Restaurant", "Bar", "Hair salon"
  lat: number;
  lng: number;
  distanceMeters: number;
  sourceUrl: string; // the OpenStreetMap page for this place
}

export interface CompetitorInfo extends ContextSource {
  label: string | null; // what we searched for, e.g. "restaurants, cafés, and bars"
  radiusMeters: number;
  items: Competitor[]; // sorted by distance
}

export interface LocalContextResponse {
  zoning: ZoningInfo;
  flood: FloodInfo;
  competitors: CompetitorInfo;
  generatedAt: string;
}

// ---------- Regulatory Radar ----------

// "mga" = Maryland General Assembly effective-date lists (enacted bills).
export type RadarSource = "md_register" | "legiscan" | "mga" | "agency_news";
export type Relevance = "affects" | "might" | "not_applicable";

export interface RadarItem {
  id: string; // stable, e.g. "mdr-26-153-P" or "bill-2026RS-HB1221"
  source: RadarSource;
  title: string;
  agency: string | null;
  kind: "proposed_regulation" | "final_regulation" | "bill" | "news";
  citation: string | null; // COMAR citation or bill number
  summary: string; // OUR short summary, max 2 sentences (never copied regulation text)
  publishedDate: string | null; // ISO date
  effectiveDate: string | null;
  commentDeadline: string | null;
  hearingDate: string | null;
  sourceUrl: string; // official page
  fetchedAt: string;
  isNew?: boolean; // agency news not seen in the last 7 days
}

export interface RadarResult {
  item: RadarItem;
  relevance: Relevance;
  reason: string; // one sentence, references specific profile fields
  actionNeeded: string | null;
  autoSorted: boolean; // false when Claude sorting was unavailable
}

export interface RadarResponse {
  results: RadarResult[];
  lastChecked: string;
  usingCachedData: boolean;
  savedResultsFrom: string | null; // oldest saved-data date when usingCachedData
  unavailableSources: string[];
}
