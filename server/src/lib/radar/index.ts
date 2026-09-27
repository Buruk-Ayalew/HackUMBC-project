// Combines every Radar source into one deduplicated RadarItem list and saves it
// to server/data/cache/radar-items.json.

import { dataPath, readJson, writeJson } from "../jsonStore.js";
import { fetchAgencyNews } from "./agencyNews.js";
import type { RadarItemInternal, SourceResult } from "./common.js";
import { fetchMdRegister } from "./mdRegister.js";
import { fetchMgaBills } from "./mgaBills.js";
import { fetchMgaEffectiveDates } from "./mgaChapters.js";
import { fetchRateChanges } from "./rateChanges.js";

const ITEMS_FILE = dataPath("cache", "radar-items.json");
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FALLBACK_MS = 60 * 60 * 1000;

export interface RadarItemsSnapshot {
  fetchedAt: string;
  items: RadarItemInternal[];
  usingCachedData: boolean;
  savedResultsFrom: string | null;
  unavailableSources: string[];
}

// Bills can come from both the live bill index and the effective-date lists.
// Merge them by bill number, preferring the list entry (official effective
// date, listed first) and filling gaps (hearing date) from the live index.
function mergeBills(items: RadarItemInternal[]): RadarItemInternal[] {
  const out: RadarItemInternal[] = [];
  const byNumber = new Map<string, RadarItemInternal>();
  const sorted = [...items].sort((a, b) => (a.source === "mga" ? -1 : 0) - (b.source === "mga" ? -1 : 0));
  for (const item of sorted) {
    if (item.kind !== "bill" || !item.citation) {
      out.push(item);
      continue;
    }
    const year = item.id.match(/^bill-(\d{4})RS-/)?.[1] ?? "";
    const numbers = item.citation.split(",").map((n) => `${year}-${n.trim().replace(/\s+/g, "")}`);
    const existing = numbers.map((n) => byNumber.get(n)).find(Boolean);
    if (existing) {
      for (const k of ["effectiveDate", "publishedDate", "hearingDate"] as const) existing[k] ??= item[k];
      continue;
    }
    numbers.forEach((n) => byNumber.set(n, item));
    out.push(item);
  }
  return out;
}

function friendlyError(error: string | undefined): string {
  if (!error) return "unavailable";
  if (/403/.test(error)) return "blocked our request (HTTP 403), so we skipped it";
  const status = error.match(/HTTP (\d{3})/)?.[1];
  if (status) return `returned an error (HTTP ${status})`;
  if (/no .*(found|could be read)/i.test(error)) return "page format changed; couldn't read it";
  return "couldn't be reached right now";
}

// One refresh at a time: concurrent callers share the in-flight one.
let inflight: Promise<RadarItemsSnapshot> | null = null;

export function getAllRadarItems(force = false): Promise<RadarItemsSnapshot> {
  inflight ??= fetchAll(force).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function fetchAll(force: boolean): Promise<RadarItemsSnapshot> {
  const settled = await Promise.allSettled([
    fetchMdRegister(force),
    fetchMgaEffectiveDates(force),
    fetchMgaBills(force),
    fetchAgencyNews(force),
    fetchRateChanges(),
  ]);
  const names = ["Maryland Register", "General Assembly effective-date lists", "General Assembly bills", "Agency news", "Live wage and tax-rate checks"];

  const results: SourceResult[] = [];
  const unavailableSources: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") results.push(...(Array.isArray(s.value) ? s.value : [s.value]));
    else {
      const msg = s.reason instanceof Error ? s.reason.message : String(s.reason);
      unavailableSources.push(`${names[i]}: unavailable, and no saved copy yet`);
    }
  });

  const fallbacks = results.filter((r) => r.fromFallback);
  for (const r of fallbacks) {
    unavailableSources.push(`${r.source}: ${friendlyError(r.error)}${r.items.length ? " (showing saved results)" : ""}`);
  }
  const withSavedData = fallbacks.filter((r) => r.items.length > 0);

  const byId = new Map<string, RadarItemInternal>();
  for (const item of mergeBills(results.flatMap((r) => r.items))) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }

  const snapshot: RadarItemsSnapshot = {
    fetchedAt: new Date().toISOString(),
    items: [...byId.values()],
    usingCachedData: withSavedData.length > 0,
    savedResultsFrom: withSavedData.length ? withSavedData.map((r) => r.fetchedAt).sort()[0] : null,
    unavailableSources,
  };
  await writeJson(ITEMS_FILE, snapshot);
  return snapshot;
}

// Saved items if they're less than a day old; otherwise refresh. If the
// refresh itself blows up, serve the saved items marked as cached.
export async function getRadarItems(): Promise<RadarItemsSnapshot> {
  const saved = await readJson<RadarItemsSnapshot | null>(ITEMS_FILE, null);
  // If the last refresh had to fall back to saved data, retry sooner.
  const maxAge = saved?.usingCachedData ? RETRY_AFTER_FALLBACK_MS : MAX_AGE_MS;
  if (saved && Date.now() - Date.parse(saved.fetchedAt) < maxAge) return saved;
  try {
    return await getAllRadarItems();
  } catch (err) {
    console.error("[radar] refresh failed", err);
    if (saved) return { ...saved, usingCachedData: true, savedResultsFrom: saved.savedResultsFrom ?? saved.fetchedAt };
    throw err;
  }
}
