import type { ObligationFrequency, ObligationResult } from "../../../shared/types";
import { daysUntil } from "./dates";

export const FREQUENCY_LABELS: Record<ObligationFrequency, string> = {
  once: "Once",
  ongoing: "Ongoing",
  every_payroll: "Every payroll",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  every_2_years: "Every 2 years",
  varies: "Varies",
};

export type StatusTone = "red" | "amber" | "green" | "blue" | "slate" | "brand";

export function scheduleStatus(r: ObligationResult): { label: string; tone: StatusTone } {
  if (r.status === "might") return { label: "Might apply", tone: "amber" };
  const next = r.upcoming[0];
  if (next) {
    const n = daysUntil(next.date);
    if (n <= 0) return { label: "Due today", tone: "red" };
    if (n <= 14) return { label: `Due in ${n} day${n === 1 ? "" : "s"}`, tone: "red" };
    if (n <= 45) return { label: `Due in ${n} days`, tone: "amber" };
    return { label: "Upcoming", tone: "slate" };
  }
  const f = r.rule.frequency;
  if (f === "once") return { label: "One-time", tone: "blue" };
  if (f === "every_payroll") return { label: "Every payroll", tone: "brand" };
  if (f === "varies") return { label: "Check your date", tone: "slate" };
  return { label: "Ongoing", tone: "green" };
}

export interface AgencyGroup {
  agency: string;
  items: ObligationResult[];
}

// Affects + might results grouped by the agency you file with, groups ordered
// by their soonest due date.
export function groupByAgency(results: ObligationResult[]): AgencyGroup[] {
  const groups = new Map<string, ObligationResult[]>();
  for (const r of results) {
    if (r.status === "not_applicable") continue;
    const key = r.rule.agency ?? "Other";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const soonest = (items: ObligationResult[]) =>
    items.map((i) => i.upcoming[0]?.date ?? "9999").sort()[0] ?? "9999";
  return [...groups.entries()]
    .map(([agency, items]) => ({
      agency,
      items: items.sort(
        (a, b) =>
          (a.status === "might" ? 1 : 0) - (b.status === "might" ? 1 : 0) ||
          (a.upcoming[0]?.date ?? "9999").localeCompare(b.upcoming[0]?.date ?? "9999"),
      ),
    }))
    .sort((a, b) => soonest(a.items).localeCompare(soonest(b.items)));
}

export interface UpcomingItem {
  date: string;
  label: string;
  result: ObligationResult;
}

export function allUpcoming(results: ObligationResult[]): UpcomingItem[] {
  return results
    .filter((r) => r.status !== "not_applicable")
    .flatMap((r) => r.upcoming.map((u) => ({ ...u, result: r })))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const CATEGORY_LABELS: Record<import("../../../shared/types").ObligationCategory, string> = {
  employment: "Employment",
  tax: "Taxes",
  registration: "Registration",
  licensing: "Licenses & permits",
  posting: "Posters & notices",
  privacy: "Privacy",
};
