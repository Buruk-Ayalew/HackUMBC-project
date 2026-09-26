// LegiScan API: current-session Maryland bills with status and last action.
// Needs LEGISCAN_API_KEY in server/.env (free key, 30,000 queries/month).
// We make one getMasterList call per refresh (cached 12 hours) and skip getBill
// entirely: the master list has what we need, and effective dates come from the
// General Assembly lists (mgaChapters.ts), which are the official source.

import { politeFetchJson } from "../http.js";
import { looksBusinessRelated, withCache, type RadarItemInternal, type SourceResult } from "./common.js";
import { billUrl } from "./mgaChapters.js";

const CACHE_FILE = "legiscan.json";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const RECENT_ACTION_DAYS = 60;

// LegiScan status codes: 1 Introduced, 2 Engrossed, 3 Enrolled, 4 Passed, 5 Vetoed, 6 Failed
const STATUS_LABEL: Record<number, string> = { 1: "Introduced", 2: "Passed one chamber", 3: "Enrolled", 4: "Passed", 5: "Vetoed", 6: "Failed" };

interface MasterListBill {
  bill_id: number;
  number: string;
  status: number;
  status_date: string | null;
  last_action_date: string | null;
  last_action: string | null;
  title: string;
  description: string;
}

interface MasterListResponse {
  status: "OK" | "ERROR";
  alert?: { message: string };
  masterlist?: { session?: { year_start: number; special: number; session_name: string } } & Record<string, unknown>;
}

async function fetchLive(): Promise<RadarItemInternal[]> {
  const key = process.env.LEGISCAN_API_KEY;
  if (!key) throw new Error("LEGISCAN_API_KEY is not set");
  const url = `https://api.legiscan.com/?key=${encodeURIComponent(key)}&op=getMasterList&state=MD`;
  const res = await politeFetchJson<MasterListResponse>(url, 20000);
  if (res.status !== "OK" || !res.masterlist) {
    // Never log the URL: it contains the key.
    throw new Error(`LegiScan error: ${res.alert?.message?.split(" -- ")[0] ?? "unknown"}`);
  }
  const session = res.masterlist.session;
  const year = session?.year_start ?? new Date().getFullYear();
  const fetchedAt = new Date().toISOString();
  const cutoff = Date.now() - RECENT_ACTION_DAYS * 86400000;

  const bills = Object.entries(res.masterlist)
    .filter(([k]) => k !== "session")
    .map(([, v]) => v as MasterListBill)
    .filter((b) => b && b.number && b.title);

  return bills
    .filter((b) => b.status === 4 || b.status === 3 || (b.last_action_date && Date.parse(b.last_action_date) >= cutoff))
    .filter((b) => looksBusinessRelated(`${b.title} ${b.description}`))
    .map((b): RadarItemInternal => {
      const number = b.number.replace(/^([A-Z]+)0*(\d+)$/, "$1 $2");
      const status = STATUS_LABEL[b.status] ?? "In progress";
      return {
        id: `bill-${year}RS-${number.replace(" ", "")}`,
        source: "legiscan",
        title: b.title,
        agency: "Maryland General Assembly",
        kind: "bill",
        citation: number,
        summary: `${status} bill in the ${year} session${b.last_action ? `; latest action: ${b.last_action}` : ""}.`,
        publishedDate: b.status_date ?? null,
        effectiveDate: null,
        commentDeadline: null,
        hearingDate: null,
        sourceUrl: session?.special ? `https://legiscan.com/MD/bill/${b.number}/${year}` : billUrl(number, year),
        fetchedAt,
        context: `${b.title}. ${b.description}. Status: ${status}. Last action (${b.last_action_date ?? "date unknown"}): ${b.last_action ?? "none"}`.slice(0, 1500),
      };
    });
}

export async function fetchLegiScan(force = false): Promise<SourceResult> {
  const r = await withCache(CACHE_FILE, MAX_AGE_MS, force, fetchLive);
  return { source: "LegiScan bills", items: r.data, fetchedAt: r.fetchedAt, fromFallback: r.fromFallback, error: r.error };
}
