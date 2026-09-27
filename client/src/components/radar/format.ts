import type { RadarItem, RadarSource } from "../../../../shared/types";

export const SOURCE_LABEL: Record<RadarSource, string> = {
  md_register: "Maryland Register",
  legiscan: "Bill",
  mga: "Bill",
  agency_news: "Agency news",
  rate_change: "Rate change",
};

export const KIND_LABEL: Record<RadarItem["kind"], string> = {
  proposed_regulation: "Proposed rule",
  final_regulation: "Final rule",
  bill: "New law",
  news: "News",
};

// ISO date ("2026-10-19") -> "Oct 19, 2026". Parsed at noon UTC so it never shifts a day.
export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: iso.length === 10 ? "UTC" : undefined });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysUntil(iso: string): number {
  return Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${todayIso()}T12:00:00Z`)) / 86400000);
}

// The date a user most cares about for filtering by date range.
export function keyDate(item: RadarItem): string | null {
  return item.commentDeadline ?? item.hearingDate ?? item.effectiveDate ?? item.publishedDate;
}
