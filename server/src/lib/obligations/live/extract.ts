// Parsers that read current values out of official pages. Each returns null
// when the page no longer matches what we expect, so we never show a guess.

export interface TaxRates {
  fiscalYear: string; // e.g. "FY 2026"
  rates: Record<string, { admissions: number; hotel: number }>; // keyed by county name as Census gives it
}

const DLS_NAME_TO_COUNTY: Record<string, string> = {
  "Baltimore City": "Baltimore City",
  Baltimore: "Baltimore County",
};

// DLS "Other Local Tax Rates in Maryland" table: each county row ends with
// Admissions/Amusement (prior FY, current FY) then Hotel Rental (prior, current).
export function parseTaxRates(lines: string[]): TaxRates | null {
  const header = lines.find((l) => /^County\b.*FY \d{4}/.test(l));
  const years = header?.match(/FY \d{4}/g);
  if (!years?.length) return null;
  const fiscalYear = years[years.length - 1]!;
  const start = lines.indexOf(header!);
  const rates: TaxRates["rates"] = {};
  for (const line of lines.slice(start + 1)) {
    const m = line.match(/^([A-Z][A-Za-z.' ]+?)\s*\t/);
    if (!m) continue;
    const pcts = [...line.matchAll(/(\d+(?:\.\d+)?)%/g)].map((x) => Number(x[1]));
    if (pcts.length < 4) continue;
    const name = m[1]!.trim();
    const county = DLS_NAME_TO_COUNTY[name] ?? `${name} County`;
    const [, aaCurrent, , hotelCurrent] = pcts.slice(-4) as [number, number, number, number];
    rates[county] = { admissions: aaCurrent, hotel: hotelCurrent };
  }
  // Maryland has 24 county-level jurisdictions; anything else means the layout changed.
  return Object.keys(rates).length === 24 ? { fiscalYear, rates } : null;
}

export interface Wages {
  state: string; // "$15.00"
  stateTipped: string;
  howard: string;
  princeGeorges: string;
  mcLarge: string;
  mcMid: string;
  mcSmall: string;
  mcTipped: string;
  countyEffective: string | null; // e.g. "July 1, 2026"
}

function money(s: string | undefined): string | null {
  if (!s) return null;
  const n = Number(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : null;
}

// MD Labor "Minimum Wage and Overtime Law" page.
export function parseWages(text: string): Wages | null {
  const grab = (re: RegExp) => money(text.match(re)?.[1]);
  const howardAt = text.indexOf("Howard County Minimum Wage As of");
  const mcAt = text.indexOf("Montgomery County Minimum Wage As of");
  const pgAt = text.indexOf("Prince George's County Minimum Wage As of");
  if (howardAt < 0 || mcAt < 0 || pgAt < 0) return null;
  const howardText = text.slice(howardAt, mcAt);
  const mcText = text.slice(mcAt, pgAt);
  const pgText = text.slice(pgAt, pgAt + 400);

  const w = {
    state: grab(/State Minimum Wage Rate of (\$[\d.,]+) per hour/),
    stateTipped: grab(/Tipped Employees \(earning more than \$30 per month in tips\).{0,200}?pay at least (\$[\d.,]+) per hour/),
    howard: money(howardText.match(/must pay at least (\$[\d.,]+) per hour/)?.[1]),
    mcLarge: money(mcText.match(/Large employers \(51 or more employees\) must pay at least (\$[\d.,]+)/)?.[1]),
    mcMid: money(mcText.match(/Mid-sized employers\W*\(11 to 50 employees\) must pay at least (\$[\d.,]+)/)?.[1]),
    mcSmall: money(mcText.match(/Small employers \(10 or fewer employees\) must pay at least (\$[\d.,]+)/)?.[1]),
    mcTipped: money(mcText.match(/pay tipped employees at least (\$[\d.,]+) per hour/)?.[1]),
    princeGeorges: money(pgText.match(/must pay at least (\$[\d.,]+) per hour/)?.[1]),
  };
  if (Object.values(w).some((v) => v === null)) return null;
  const countyEffective = howardText.match(/As of ([A-Z][a-z]+ \d{1,2}, \d{4})/)?.[1] ?? null;
  return { ...(w as Omit<Wages, "countyEffective">), countyEffective };
}

export interface Famli {
  rate: string; // "0.9%"
  half: string; // "0.45%"
}

// FAMLI "Make contributions" page.
export function parseFamli(text: string): Famli | null {
  const rate = text.match(/initial contribution rate at ([\d.]+)% of wages/)?.[1];
  if (!rate) return null;
  const half = (Number(rate) / 2).toString();
  return { rate: `${rate}%`, half: `${half}%` };
}
