import type { ObligationFrequency, ObligationResult } from "../../../shared/types";

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
