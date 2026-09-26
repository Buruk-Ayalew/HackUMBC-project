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
  deadlines?: { label: string; date: string }[]; // ISO dates
  sourceUrl: string;
  sourceName: string;
  reviewedOn: string; // ISO date
}

export interface ObligationResult {
  rule: ObligationRule;
  status: "affects" | "might" | "not_applicable";
  reasons: string[];
  coverage: "reviewed" | "limited";
  coverageNote?: string;
}

// GET /api/obligations and POST /api/obligations/what-if
export interface ObligationsResponse {
  results: ObligationResult[];
  // Profile-level notes about what we have NOT reviewed for this location.
  coverageNotes: string[];
  // Employee counts where some rule changes, from rules' numeric conditions.
  thresholds: number[];
  evaluatedAt: string;
}
