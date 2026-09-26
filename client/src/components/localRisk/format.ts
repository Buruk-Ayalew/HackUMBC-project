import type { RiskCategory, RiskLevel } from "../../../../shared/types";

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
