import type { RadarItem } from "../../../../shared/types.js";
import { dataPath, readJson, writeJson } from "../jsonStore.js";

// Server-side item: `context` is a short excerpt from the official source that
// we send to Claude so it can write its own summary. Never sent to the browser.
export interface RadarItemInternal extends RadarItem {
  context?: string;
}

export interface SourceResult {
  source: string; // human-readable source name, used in unavailableSources
  items: RadarItemInternal[];
  fetchedAt: string;
  // True when the live fetch failed and we fell back to a saved copy.
  fromFallback: boolean;
  error?: string;
}

interface CacheFile<T> {
  fetchedAt: string;
  data: T;
}

// Serve a fresh-enough cache, otherwise fetch live; if the live fetch fails,
// fall back to whatever cache exists (however old).
export async function withCache<T>(
  file: string,
  maxAgeMs: number,
  force: boolean,
  fetchLive: () => Promise<T>,
): Promise<{ data: T; fetchedAt: string; fromFallback: boolean; error?: string }> {
  const path = dataPath("cache", file);
  const cached = await readJson<CacheFile<T> | null>(path, null);
  if (!force && cached && Date.now() - Date.parse(cached.fetchedAt) < maxAgeMs) {
    return { data: cached.data, fetchedAt: cached.fetchedAt, fromFallback: false };
  }
  try {
    const data = await fetchLive();
    const fetchedAt = new Date().toISOString();
    await writeJson(path, { fetchedAt, data });
    return { data, fetchedAt, fromFallback: false };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn(`[radar] live fetch for ${file} failed: ${error}`);
    if (cached) return { data: cached.data, fetchedAt: cached.fetchedAt, fromFallback: true, error };
    throw err;
  }
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

// "October 19, 2026" -> "2026-10-19"; null if not a real date.
export function parseLongDate(text: string | undefined | null): string | null {
  if (!text) return null;
  const m = text.match(/([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  return isoDate(Number(m[3]), month + 1, Number(m[2]));
}

export function isoDate(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

export function formatLongDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function cleanText(s: string): string {
  return s.replace(/[\u200b\u200c\u200d\ufeff]/g, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

// Words that suggest a bill or rule could touch a small business. Used only to
// pre-filter; Claude makes the actual relevance call.
export const BUSINESS_KEYWORDS = [
  "labor", "employ", "wage", "leave", "worker", "workplace", "tax", "license", "licens",
  "business", "food", "restaurant", "alcohol", "beverage", "packaging", "procurement",
  "privacy", "personal information", "data", "consumer", "commercial", "contract",
  "lodging", "hotel", "rental", "construction", "contractor", "cosmetolog", "barber",
  "retail", "sales", "insurance", "unemployment", "minimum", "tip", "gratuit", "overtime",
  "occupational", "permit", "fee", "small", "vendor", "corporation", "limited liability",
];

const KEYWORD_RE = new RegExp(`\\b(${BUSINESS_KEYWORDS.join("|")})`, "i");

export function looksBusinessRelated(text: string): boolean {
  return KEYWORD_RE.test(text);
}
