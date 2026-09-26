// Maryland General Assembly "effective dates" lists (Department of Legislative
// Services). Each PDF lists every enacted chapter taking effect on one date,
// e.g. https://mgaleg.maryland.gov/Pubs/LegisLegal/2026rs-effective-dates-october.pdf
// This is our authoritative source for bill effective dates, and it works
// without a LegiScan key.

import { PDFParse } from "pdf-parse";
import { politeFetch } from "../http.js";
import { cleanText, formatLongDate, looksBusinessRelated, parseLongDate, withCache, type RadarItemInternal, type SourceResult } from "./common.js";

// DLS publishes one list per effective date (not every month exists every
// year). We try this year's and last year's sessions, so the lists roll over
// to 2027 and beyond on their own; missing lists are skipped.
const LIST_MONTHS = ["january", "june", "july", "october"];
const KEEP_AFTER_MS = 365 * 24 * 60 * 60 * 1000; // laws that took effect in the last year, or will
const CACHE_FILE = "mga-effective-dates.json";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const listUrl = (sessionYear: number, month: string) =>
  `https://mgaleg.maryland.gov/Pubs/LegisLegal/${sessionYear}rs-effective-dates-${month}.pdf`;

function listTargets(now = new Date()): [number, string][] {
  const y = now.getFullYear();
  return [y, y - 1].flatMap((year) => LIST_MONTHS.map((m): [number, string] => [year, m]));
}
export const billUrl = (number: string, sessionYear: number) =>
  `https://mgaleg.maryland.gov/mgawebsite/Legislation/Details/${number.replace(/\s+/g, "").toLowerCase()}?ys=${sessionYear}RS`;

interface Chapter {
  number: string; // "HB 1221"
  chapter: number;
  sessionYear: number;
  effectiveDate: string;
  title: string;
  description: string;
}

function titleCase(s: string): string {
  const small = new Set(["of", "and", "the", "for", "on", "in", "to", "a", "an", "or", "by", "at"]);
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.replace(/^([("“]?)(\p{L})/u, (_, p, c) => p + c.toUpperCase())))
    .join(" ");
}

export function parseEffectiveDatesText(text: string): Chapter[] {
  const lines = text.split("\n").map((l) => cleanText(l.replace(/\t/g, " "))).filter(Boolean);
  const out: Chapter[] = [];
  let sessionYear = 0;
  let effectiveDate: string | null = null;
  let cur: Chapter | null = null;
  let stage: "sponsor" | "title" | "desc" = "desc";

  const flush = () => {
    if (cur && cur.title) out.push({ ...cur, title: cleanText(cur.title), description: cleanText(cur.description) });
    cur = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const header = line.match(/(\d{4}) Chapters – Effective ([A-Za-z]+ \d{1,2}, \d{4})/);
    if (header) {
      sessionYear = Number(header[1]);
      effectiveDate = parseLongDate(header[2]);
      continue;
    }
    if (/^-- \d+ of \d+ --$/.test(line) || /Department of Legislative Services|State Circle|Baltimore Area:|Other Maryland Areas:/.test(line)) continue;

    const bill = line.match(/^(HB|SB) (\d+)$/);
    const chapter = lines[i + 1]?.match(/^Chapter (\d+)$/);
    if (bill && chapter && effectiveDate) {
      flush();
      cur = { number: `${bill[1]} ${bill[2]}`, chapter: Number(chapter[1]), sessionYear, effectiveDate, title: "", description: "" };
      stage = "sponsor";
      i++; // skip the "Chapter N" line
      continue;
    }
    if (!cur) continue;
    const c: Chapter = cur;
    if (stage === "sponsor") {
      stage = "title";
    } else if (stage === "title" && !/[a-z]/.test(line)) {
      c.title += ` ${line}`;
    } else {
      stage = "desc";
      c.description += ` ${line}`;
    }
  }
  flush();
  return out;
}

async function fetchList([sessionYear, month]: [number, string]): Promise<Chapter[]> {
  const res = await politeFetch(listUrl(sessionYear, month), {}, 30000);
  const parser = new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) });
  try {
    const { text } = await parser.getText();
    return parseEffectiveDatesText(text);
  } finally {
    await parser.destroy();
  }
}

function toItems(chapters: Chapter[], fetchedAt: string): RadarItemInternal[] {
  // Cross-filed bills (HB and SB with the same title) become one item.
  const groups = new Map<string, Chapter[]>();
  for (const c of chapters) {
    // Titles only: DLS descriptions mention "fees", "data", etc. on almost every bill.
    if (!looksBusinessRelated(c.title)) continue;
    const key = `${c.sessionYear}|${c.effectiveDate}|${c.title.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.values()].map((group) => {
    const first = group[0];
    const numbers = group.map((g) => g.number);
    const chapters = group.map((g) => g.chapter).join(" and ");
    return {
      id: `bill-${first.sessionYear}RS-${first.number.replace(" ", "")}`,
      source: "mga",
      title: titleCase(first.title),
      agency: "Maryland General Assembly",
      kind: "bill",
      citation: numbers.join(", "),
      summary: `State law enacted in the ${first.sessionYear} session (Chapter ${chapters}). It takes effect ${formatLongDate(first.effectiveDate)}.`,
      publishedDate: null,
      effectiveDate: first.effectiveDate,
      commentDeadline: null,
      hearingDate: null,
      sourceUrl: billUrl(first.number, first.sessionYear),
      fetchedAt,
      context: `${first.title}. ${first.description}`.slice(0, 1500),
    } satisfies RadarItemInternal;
  });
}

export async function fetchMgaEffectiveDates(force = false): Promise<SourceResult> {
  const r = await withCache(CACHE_FILE, MAX_AGE_MS, force, async () => {
    const settled = await Promise.allSettled(listTargets().map(fetchList));
    const cutoff = new Date(Date.now() - KEEP_AFTER_MS).toISOString().slice(0, 10);
    const chapters = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : [])).filter((c) => c.effectiveDate >= cutoff);
    if (chapters.length === 0) {
      const failed = settled.find((x): x is PromiseRejectedResult => x.status === "rejected");
      throw failed ? failed.reason : new Error("no chapters found in the MGA lists");
    }
    return toItems(chapters, new Date().toISOString());
  });
  return { source: "General Assembly effective-date lists", items: r.data, fetchedAt: r.fetchedAt, fromFallback: r.fromFallback, error: r.error };
}
