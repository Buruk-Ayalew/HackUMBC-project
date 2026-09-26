// Agency news pages (Labor, FAMLI, Comptroller, SDAT). Sites are listed in
// server/data/radar/agency-news-sources.json; each entry gives a CSS selector
// for the news links on that page. Checked at most once a day. If a site
// blocks us (HTTP 403) we report it as unavailable and move on.

import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { HttpError, politeFetch } from "../http.js";
import { dataPath, readJson, writeJson } from "../jsonStore.js";
import { cleanText, isoDate, parseLongDate, type RadarItemInternal, type SourceResult } from "./common.js";

interface NewsSourceConfig {
  id: string;
  agency: string;
  url: string;
  linkSelector: string;
  maxItems: number;
}

interface NewsSnapshot {
  sources: Record<string, { fetchedAt: string; items: RadarItemInternal[] }>;
  firstSeen: Record<string, string>; // item id -> ISO time we first saw it
}

const SNAPSHOT = dataPath("cache", "agency-news.json");
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NEW_FOR_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_NEWS_AGE_DAYS = 365;

function findDate(text: string, href: string): string | null {
  const long = parseLongDate(text.match(/[A-Z][a-z]+\.? \d{1,2}, \d{4}/)?.[0]);
  if (long) return long;
  const us = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/) ?? href.match(/\/(\d{2})-(\d{2})-(\d{4})-/);
  if (us) return isoDate(Number(us[3]), Number(us[1]), Number(us[2]));
  const iso = href.match(/\/(\d{4})-(\d{2})-(\d{2})-/);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

function cleanTitle(raw: string): string {
  return cleanText(raw)
    .replace(/^(Press release|News Release)\s*:\s*/i, "")
    .replace(/\s*-\s*\d{2}\/\d{2}\/\d{4}$/, "")
    .trim();
}

export function parseNewsPage(html: string, cfg: NewsSourceConfig, fetchedAt: string): RadarItemInternal[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: RadarItemInternal[] = [];
  const cutoff = Date.now() - MAX_NEWS_AGE_DAYS * 86400000;

  $(cfg.linkSelector).each((_, el) => {
    if (items.length >= cfg.maxItems) return false;
    const href = $(el).attr("href");
    const title = cleanTitle($(el).text());
    if (!href || !title || title.length < 8) return;
    let url: string;
    try {
      url = new URL(href, cfg.url).toString();
    } catch {
      return;
    }
    if (seen.has(url)) return;
    seen.add(url);
    const container = $(el).closest("li, p, tr, article, div");
    const date = findDate(cleanText(container.text()), href);
    if (date && Date.parse(date) < cutoff) return;
    items.push({
      id: `news-${cfg.id}-${createHash("sha1").update(url).digest("hex").slice(0, 10)}`,
      source: "agency_news",
      title,
      agency: cfg.agency,
      kind: "news",
      citation: null,
      summary: `News from ${cfg.agency}: "${title}".`,
      publishedDate: date,
      effectiveDate: null,
      commentDeadline: null,
      hearingDate: null,
      sourceUrl: url,
      fetchedAt,
      context: `Headline only: ${title}`,
    });
  });
  if (items.length === 0) console.warn(`[radar] ${cfg.agency}: no news links matched "${cfg.linkSelector}"; the page may have changed.`);
  return items;
}

async function fetchOne(cfg: NewsSourceConfig): Promise<RadarItemInternal[]> {
  const res = await politeFetch(cfg.url, {}, 20000);
  const items = parseNewsPage(await res.text(), cfg, new Date().toISOString());
  if (items.length === 0) throw new Error("no news items found on the page");
  return items;
}

export async function fetchAgencyNews(force = false): Promise<SourceResult[]> {
  const configs = await readJson<NewsSourceConfig[]>(dataPath("radar", "agency-news-sources.json"), []);
  const snap = await readJson<NewsSnapshot>(SNAPSHOT, { sources: {}, firstSeen: {} });
  const now = new Date();

  const results = await Promise.all(
    configs.map(async (cfg): Promise<SourceResult> => {
      const name = `${cfg.agency} news`;
      const prev = snap.sources[cfg.id];
      if (!force && prev && now.getTime() - Date.parse(prev.fetchedAt) < MAX_AGE_MS) {
        return { source: name, items: prev.items, fetchedAt: prev.fetchedAt, fromFallback: false };
      }
      try {
        const items = await fetchOne(cfg);
        snap.sources[cfg.id] = { fetchedAt: now.toISOString(), items };
        return { source: name, items, fetchedAt: now.toISOString(), fromFallback: false };
      } catch (err) {
        const error =
          err instanceof HttpError && err.status === 403
            ? "blocked our request (HTTP 403)"
            : err instanceof Error
              ? err.message
              : String(err);
        console.warn(`[radar] ${name} unavailable: ${error}`);
        if (prev) return { source: name, items: prev.items, fetchedAt: prev.fetchedAt, fromFallback: true, error };
        return { source: name, items: [], fetchedAt: now.toISOString(), fromFallback: true, error };
      }
    }),
  );

  // Track when each item was first seen so the page can flag new ones. On the
  // very first run we use the published date when we have one.
  for (const r of results) {
    for (const item of r.items) {
      if (!snap.firstSeen[item.id]) {
        snap.firstSeen[item.id] = item.publishedDate && !r.fromFallback ? new Date(item.publishedDate).toISOString() : now.toISOString();
      }
      item.isNew = now.getTime() - Date.parse(snap.firstSeen[item.id]) < NEW_FOR_MS;
    }
  }
  await writeJson(SNAPSHOT, snap);

  // Several agency pages link to the same press release (e.g. FAMLI and Labor).
  // Keep one copy per URL, preferring the one with a date.
  const byUrl = new Map<string, RadarItemInternal>();
  for (const item of results.flatMap((r) => r.items)) {
    const prev = byUrl.get(item.sourceUrl);
    if (!prev || (!prev.publishedDate && item.publishedDate)) byUrl.set(item.sourceUrl, item);
  }
  const keep = new Set(byUrl.values());
  return results.map((r) => ({ ...r, items: r.items.filter((i) => keep.has(i)) }));
}
