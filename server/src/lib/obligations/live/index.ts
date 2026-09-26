import type { LiveSourceStatus, ObligationRule, RuleVerification } from "../../../../../shared/types.js";
import { dataPath, readJson, writeJson } from "../../jsonStore.js";
import { parseFamli, parseTaxRates, parseWages, type Famli, type TaxRates, type Wages } from "./extract.js";
import { PageUnavailable, fetchPageText, fetchPdfLines, normalizeText } from "./pageText.js";

// Live data for the obligations module.
//  1. Values (tax rates, minimum wages, FAMLI rate) are read from official
//     pages on every refresh. Nothing is hard-coded.
//  2. Each rule's key facts ("verify" phrases) are re-checked against its
//     official source page.
// If a site is down, we keep the last successful live result (never a
// hand-made backup) and label it with the date it was fetched.

const STORE = dataPath("cache", "obligations-live.json");
const WAGE_URL = "https://labor.maryland.gov/labor/wages/wagehrfacts.shtml";
const FAMLI_URL = "https://paidleave.maryland.gov/employers/make-contributions/";
const dlsUrl = (year: number) => `https://dls.maryland.gov/pubs/prod/NoPblTabPDF/${year}CountyLocalTaxRates.pdf`;

export interface LiveValues {
  taxRates?: TaxRates;
  wages?: Wages;
  famli?: Famli;
}

interface Snapshot {
  values: LiveValues;
  sources: Record<string, LiveSourceStatus>;
  verification: Record<string, RuleVerification>;
  refreshedAt: string | null;
}

let snapshot: Snapshot = { values: {}, sources: {}, verification: {}, refreshedAt: null };
let loaded = false;
let inFlight: Promise<Snapshot> | null = null;

async function load() {
  if (loaded) return;
  // Statuses stay as they were: "saved" only means a fetch failed. How old a
  // result is shows in its fetchedAt / checkedAt date.
  snapshot = await readJson<Snapshot>(STORE, snapshot);
  loaded = true;
}

function ok(id: string, name: string, url: string): LiveSourceStatus {
  return { id, name, url, status: "live", fetchedAt: new Date().toISOString() };
}

// Keep the previous value (marked "saved") when a refresh fails.
function failed(id: string, name: string, url: string, err: unknown): LiveSourceStatus {
  const prev = snapshot.sources[id];
  const reason = err instanceof PageUnavailable ? err.reason : (err as Error).message;
  return prev?.fetchedAt
    ? { ...prev, status: "saved", url, error: reason }
    : { id, name, url, status: "unavailable", fetchedAt: null, error: reason };
}

async function refreshTaxRates(values: LiveValues, sources: Snapshot["sources"]) {
  const name = "DLS County Local Tax Rates";
  // Newest table first: DLS publishes one per fiscal year.
  const year = new Date().getFullYear();
  let lastErr: unknown = new Error("not found");
  for (const y of [year + 1, year, year - 1]) {
    try {
      const parsed = parseTaxRates(await fetchPdfLines(dlsUrl(y)));
      if (!parsed) throw new Error("the table layout changed; needs review");
      values.taxRates = parsed;
      sources.taxRates = ok("taxRates", name, dlsUrl(y));
      return;
    } catch (err) {
      lastErr = err;
      if (!(err instanceof PageUnavailable)) break; // a parse problem, not a missing year
    }
  }
  sources.taxRates = failed("taxRates", name, dlsUrl(year), lastErr);
}

async function refreshValue<K extends "wages" | "famli">(
  key: K,
  name: string,
  url: string,
  parse: (text: string) => LiveValues[K] | null,
  values: LiveValues,
  sources: Snapshot["sources"],
  pageCache: Map<string, Promise<string>>,
) {
  try {
    const parsed = parse(await getText(url, pageCache));
    if (!parsed) throw new Error("the page changed; values need review");
    values[key] = parsed;
    sources[key] = ok(key, name, url);
  } catch (err) {
    sources[key] = failed(key, name, url, err);
  }
}

function getText(url: string, cache: Map<string, Promise<string>>): Promise<string> {
  let p = cache.get(url);
  if (!p) {
    p = fetchPageText(url);
    cache.set(url, p);
  }
  return p;
}

async function verifyRules(rules: ObligationRule[], pageCache: Map<string, Promise<string>>): Promise<Record<string, RuleVerification>> {
  const out: Record<string, RuleVerification> = {};
  await Promise.allSettled(
    rules.map(async (rule) => {
      if (!rule.verify?.length) return;
      const checkedAt = new Date().toISOString();
      try {
        const text = (await getText(rule.sourceUrl, pageCache)).toLowerCase();
        const missing = rule.verify.filter((phrase) => !text.includes(normalizeText(phrase).toLowerCase()));
        out[rule.id] = missing.length ? { status: "changed", checkedAt, missing } : { status: "verified", checkedAt };
      } catch (err) {
        const prev = snapshot.verification[rule.id];
        const reason = err instanceof PageUnavailable ? err.reason : (err as Error).message;
        out[rule.id] =
          prev && prev.status !== "unavailable"
            ? { ...prev, status: "saved", error: reason }
            : { status: "unavailable", checkedAt, error: reason };
      }
    }),
  );
  return out;
}

async function doRefresh(rules: ObligationRule[]): Promise<Snapshot> {
  await load();
  const values: LiveValues = { ...snapshot.values };
  const sources: Snapshot["sources"] = {};
  const pageCache = new Map<string, Promise<string>>();

  await Promise.allSettled([
    refreshTaxRates(values, sources),
    refreshValue("wages", "MD Labor minimum wage page", WAGE_URL, parseWages, values, sources, pageCache),
    refreshValue("famli", "FAMLI contributions page", FAMLI_URL, parseFamli, values, sources, pageCache),
  ]);
  const verification = await verifyRules(rules, pageCache);

  snapshot = { values, sources, verification, refreshedAt: new Date().toISOString() };
  await writeJson(STORE, snapshot);
  const live = Object.values(sources).filter((s) => s.status === "live").length;
  const verified = Object.values(verification).filter((v) => v.status === "verified").length;
  console.log(`[obligations] live refresh: ${live}/${Object.keys(sources).length} value sources live, ${verified}/${Object.keys(verification).length} rules verified`);
  return snapshot;
}

// Refresh everything (one refresh at a time).
export function refreshLiveData(rules: ObligationRule[]): Promise<Snapshot> {
  if (!inFlight) inFlight = doRefresh(rules).finally(() => (inFlight = null));
  return inFlight;
}

const MAX_AGE_MS = 12 * 60 * 60 * 1000;

// Latest snapshot. Starts a refresh if the data is old, and waits a little
// for it on first use so the first page load shows live data.
export async function getLiveData(rules: ObligationRule[], waitMs = 20000): Promise<Snapshot> {
  await load();
  const stale = !snapshot.refreshedAt || Date.now() - Date.parse(snapshot.refreshedAt) > MAX_AGE_MS;
  if (stale) {
    const p = refreshLiveData(rules);
    await Promise.race([p, new Promise((r) => setTimeout(r, snapshot.refreshedAt ? 0 : waitMs))]);
  }
  return snapshot;
}

export function isRefreshing(): boolean {
  return inFlight !== null;
}
