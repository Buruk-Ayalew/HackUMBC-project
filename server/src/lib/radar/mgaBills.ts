// Live Maryland bills from the General Assembly's own bill index
// (https://mgaleg.maryland.gov/mgawebsite/Legislation/Index/house?ys=2026RS and
// .../senate). Replaces LegiScan: no API key, official status and hearings.
// The session year comes from today's date, so this rolls over to 2027 on its
// own; before a new session has any bills posted we fall back to last year's.

import * as cheerio from "cheerio";
import { politeFetch } from "../http.js";
import { cleanText, isoDate, looksBusinessRelated, withCache, type RadarItemInternal, type SourceResult } from "./common.js";
import { billUrl } from "./mgaChapters.js";

const CACHE_FILE = "mga-bills.json";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const CHAMBERS = ["house", "senate"] as const;

export const indexUrl = (chamber: (typeof CHAMBERS)[number], year: number) =>
  `https://mgaleg.maryland.gov/mgawebsite/Legislation/Index/${chamber}?ys=${year}RS`;

// Statuses that mean a bill became law (or is waiting on the Governor). After
// the session ends, bills without one of these died (or were vetoed) and
// can't affect anyone.
const PASSED = /Approved by the Governor|Enacted|Chapter \d+|Presented to the Governor|Passed Enrolled|Returned Passed/i;

interface IndexRow {
  number: string; // "HB 1"
  cross: string | null; // "SB 2"
  title: string;
  status: string;
  hearingDate: string | null; // ISO date of the latest listed hearing
}

// "HB0001" -> "HB 1"
function normalizeNumber(raw: string): string | null {
  const m = raw.trim().match(/^(HB|SB|HJ|SJ)0*(\d+)$/i);
  return m ? `${m[1]!.toUpperCase()} ${m[2]}` : null;
}

export function parseBillIndex(html: string): IndexRow[] {
  const $ = cheerio.load(html);
  const rows: IndexRow[] = [];
  $("#billIndex tbody tr").each((_, tr) => {
    const td = $(tr).children("td");
    if (td.length < 7) return;
    const links = td.eq(0).find("a").map((_, a) => $(a).text()).get();
    const number = normalizeNumber(links[0] ?? "");
    if (!number) return;
    const cross = links.slice(1).map(normalizeNumber).find((n): n is string => !!n && n.slice(0, 2) !== number.slice(0, 2)) ?? null;
    const hearings = [...td.eq(6).text().matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)]
      .map((m) => isoDate(Number(m[3]), Number(m[1]), Number(m[2])))
      .filter((d): d is string => !!d)
      .sort();
    rows.push({
      number,
      cross,
      title: cleanText(td.eq(1).text()),
      status: cleanText(td.eq(5).text()),
      hearingDate: hearings[hearings.length - 1] ?? null,
    });
  });
  return rows;
}

// The session runs January to early April; after April it has ended.
function sessionEnded(year: number, now = new Date()): boolean {
  return year < now.getFullYear() || now.getMonth() >= 4;
}

async function fetchChamber(chamber: (typeof CHAMBERS)[number], year: number): Promise<IndexRow[]> {
  const res = await politeFetch(indexUrl(chamber, year), {}, 60000);
  return parseBillIndex(await res.text());
}

async function fetchSession(year: number): Promise<IndexRow[]> {
  const settled = await Promise.allSettled(CHAMBERS.map((c) => fetchChamber(c, year)));
  const rows = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  if (!rows.length) {
    const failed = settled.find((x): x is PromiseRejectedResult => x.status === "rejected");
    if (failed) throw failed.reason;
  }
  return rows;
}

function toItems(rows: IndexRow[], year: number, fetchedAt: string): RadarItemInternal[] {
  const ended = sessionEnded(year);
  const seen = new Set<string>();
  const items: RadarItemInternal[] = [];
  for (const r of rows) {
    // Cross-filed bills appear in both chambers; keep one item per pair.
    const key = [r.number, r.cross].filter(Boolean).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    if (!looksBusinessRelated(r.title)) continue;
    if (ended && !PASSED.test(r.status)) continue;
    const numbers = [r.number, r.cross].filter((n): n is string => !!n);
    items.push({
      id: `bill-${year}RS-${r.number.replace(" ", "")}`,
      source: "mga",
      title: r.title,
      agency: "Maryland General Assembly",
      kind: "bill",
      citation: numbers.join(", "),
      summary: `Bill in the ${year} session. Current status: ${r.status || "not listed"}.`,
      publishedDate: null,
      effectiveDate: null,
      commentDeadline: null,
      hearingDate: r.hearingDate,
      sourceUrl: billUrl(r.number, year),
      fetchedAt,
      // Title only: the status changes often during session and would force
      // re-sorting; it is shown to the owner in the summary instead.
      context: r.title.slice(0, 1500),
    });
  }
  return items;
}

export async function fetchMgaBills(force = false): Promise<SourceResult> {
  const r = await withCache(CACHE_FILE, MAX_AGE_MS, force, async () => {
    const year = new Date().getFullYear();
    let rows = await fetchSession(year);
    let used = year;
    // Early January: the new session may not have bills posted yet.
    if (!rows.length) {
      rows = await fetchSession(year - 1);
      used = year - 1;
    }
    if (!rows.length) throw new Error("no bills could be read from the General Assembly index");
    return toItems(rows, used, new Date().toISOString());
  });
  return { source: "General Assembly bills", items: r.data, fetchedAt: r.fetchedAt, fromFallback: r.fromFallback, error: r.error };
}
