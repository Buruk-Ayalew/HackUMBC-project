import type { ImpactTag, RiskCategory, RiskLevel } from "../../../../shared/types";

export const RADIUS_OPTIONS = [
  { meters: 402, label: "¼ mile" },
  { meters: 805, label: "½ mile" },
  { meters: 1609, label: "1 mile" },
] as const;

export const LEVEL_LABEL: Record<RiskLevel, string> = { high: "High", medium: "Medium", low: "Low" };

// Tailwind classes per level (badge) and hex colors (map markers).
export const LEVEL_BADGE: Record<RiskLevel, string> = {
  high: "bg-red-100 text-red-800 ring-red-200",
  medium: "bg-amber-100 text-amber-900 ring-amber-200",
  low: "bg-slate-100 text-slate-700 ring-slate-200",
};
export const LEVEL_COLOR: Record<RiskLevel, string> = { high: "#dc2626", medium: "#d97706", low: "#64748b" };

export const CATEGORY_LABEL: Record<RiskCategory, string> = {
  road_closure: "Road closure",
  road_work: "State road project",
  demolition: "Demolition",
  new_construction: "New construction",
  site_work: "Grading / site work",
  commercial_work: "Commercial building work",
  residential_work: "Residential work",
  development_plan: "Development plan",
  other: "Other permitted work",
};

export function formatDistance(m: number): string {
  const feet = m * 3.28084;
  if (feet < 1000) return `${Math.max(50, Math.round(feet / 50) * 50)} ft`;
  return `${(m / 1609.344).toFixed(1)} mi`;
}

// "2026-09-21" is a calendar date (no time zone shift); longer strings are ISO datetimes.
export function formatDate(s: string | null): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// ---------- Impact tags ----------
// Tags are assigned on the server (server/src/lib/risk/impacts.ts). The blurbs are
// general for each tag, not about any one item.

export const IMPACT_ORDER: ImpactTag[] = [
  "access_parking",
  "noise_dust",
  "future_development",
  "competition",
  "property_rules",
  "flood_risk",
  "minor_activity",
];

export const IMPACT_LABEL: Record<ImpactTag, string> = {
  access_parking: "Access & parking",
  noise_dust: "Noise & dust",
  future_development: "Future development",
  competition: "Competition",
  property_rules: "Property rules",
  flood_risk: "Flood risk",
  minor_activity: "Minor activity",
};

export const IMPACT_BLURB: Record<ImpactTag, string> = {
  access_parking: "Closures and work zones can make it harder for customers, deliveries, and staff to reach you or park nearby.",
  noise_dust: "Heavy work nearby can bring noise, dust, and vibration during working hours.",
  future_development:
    "Planned and new projects can change an area over time: construction first, then possibly new neighbors, residents, or customers.",
  competition:
    "Similar businesses nearby compete for the same customers. A cluster of them can also draw more people to the area.",
  property_rules:
    "Your zoning district sets what the property can be used for. Expanding, changing how you use the space, or adding signs may need approval.",
  flood_risk:
    "Property in or near a high-risk flood zone may need separate flood insurance, and flooding can close roads and damage stock.",
  minor_activity: "Small jobs like repairs, renovations, or home projects. These usually have little effect on nearby businesses.",
};

export const IMPACT_CHIP: Record<ImpactTag, string> = {
  access_parking: "bg-amber-50 text-amber-800 ring-amber-600/20",
  noise_dust: "bg-orange-50 text-orange-800 ring-orange-600/20",
  future_development: "bg-sky-50 text-sky-800 ring-sky-600/20",
  competition: "bg-violet-50 text-violet-800 ring-violet-600/20",
  property_rules: "bg-indigo-50 text-indigo-800 ring-indigo-600/20",
  flood_risk: "bg-cyan-50 text-cyan-800 ring-cyan-600/20",
  minor_activity: "bg-slate-100 text-slate-600 ring-slate-500/15",
};
