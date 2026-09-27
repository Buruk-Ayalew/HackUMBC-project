import type { LiveValues } from "./index.js";

// When a daily live check reads a different wage, tax rate, or FAMLI rate than
// last time, we record the change. Regulatory Radar shows these to the
// businesses they affect. Only real before/after readings from the official
// pages are recorded; a first reading (no "before") is not a change.

export interface ValueChange {
  id: string; // stable, e.g. "wages.mcSmall:$16.25"
  label: string; // "Montgomery County minimum wage (10 or fewer employees)"
  from: string;
  to: string;
  detectedAt: string; // ISO
  effectiveDate: string | null; // ISO date, when the page states one
  agency: string;
  sourceUrl: string;
}

const WAGE_LABELS: Record<string, string> = {
  state: "Maryland minimum wage",
  stateTipped: "Maryland tipped employee cash wage",
  howard: "Howard County minimum wage",
  princeGeorges: "Prince George's County minimum wage",
  mcLarge: "Montgomery County minimum wage (51 or more employees)",
  mcMid: "Montgomery County minimum wage (11 to 50 employees)",
  mcSmall: "Montgomery County minimum wage (10 or fewer employees)",
  mcTipped: "Montgomery County tipped employee cash wage",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "July 1, 2026" -> "2026-07-01"
function isoFromLong(s: string | null | undefined): string | null {
  const m = s?.match(/^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/);
  const month = m ? MONTHS.indexOf(m[1]!) : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}` : null;
}

export function diffValues(
  prev: LiveValues,
  next: LiveValues,
  urls: { wages: string; famli: string; taxRates: string },
  now = new Date().toISOString(),
): ValueChange[] {
  const out: ValueChange[] = [];
  const add = (key: string, label: string, from: string | undefined, to: string | undefined, agency: string, sourceUrl: string, effectiveDate: string | null = null) => {
    if (from === undefined || to === undefined || from === to) return;
    out.push({ id: `${key}:${to}`, label, from, to, detectedAt: now, effectiveDate, agency, sourceUrl });
  };

  if (prev.wages && next.wages) {
    for (const [k, label] of Object.entries(WAGE_LABELS)) {
      const county = k !== "state" && k !== "stateTipped";
      add(`wages.${k}`, label, prev.wages[k as keyof typeof prev.wages] ?? undefined, next.wages[k as keyof typeof next.wages] ?? undefined,
        "Maryland Department of Labor", urls.wages, county ? isoFromLong(next.wages.countyEffective) : null);
    }
  }
  if (prev.famli && next.famli) add("famli.rate", "FAMLI contribution rate", prev.famli.rate, next.famli.rate, "Maryland FAMLI (Department of Labor)", urls.famli);
  if (prev.taxRates && next.taxRates) {
    for (const [county, rate] of Object.entries(next.taxRates.rates)) {
      const before = prev.taxRates.rates[county];
      if (!before) continue;
      add(`tax.${county}.admissions`, `${county} admissions and amusement tax rate`, `${before.admissions}%`, `${rate.admissions}%`, "Department of Legislative Services", urls.taxRates);
      add(`tax.${county}.hotel`, `${county} hotel rental tax rate`, `${before.hotel}%`, `${rate.hotel}%`, "Department of Legislative Services", urls.taxRates);
    }
  }
  return out;
}

// Keep a year of changes (newest first), at most 50.
export function mergeChanges(newOnes: ValueChange[], old: ValueChange[] = [], now = Date.now()): ValueChange[] {
  const cutoff = now - 400 * 24 * 60 * 60 * 1000;
  const seen = new Set<string>();
  return [...newOnes, ...old]
    .filter((c) => Date.parse(c.detectedAt) >= cutoff && !seen.has(c.id) && seen.add(c.id))
    .slice(0, 50);
}
