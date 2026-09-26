import { dataPath, readJson, writeJson } from "../jsonStore.js";
import type { NormalizedRiskItem } from "./normalize.js";

// Cache-first wrapper for one source. Fresh cache is served without a network
// call (be polite). Stale or missing cache triggers a live fetch; if that fails,
// stale cache is served and the caller shows "Showing saved results from [date]".

export const REFRESH_MS = 12 * 60 * 60 * 1000;

interface CacheEntry<T> {
  fetchedAt: string;
  items: T;
}

type CacheFile<T> = Record<string, CacheEntry<T>>;

export interface CachedResult<T = NormalizedRiskItem[]> {
  items: T;
  status: "live" | "cached" | "unavailable";
  fetchedAt: string | null;
  message?: string;
}

export function cacheFile(name: string): string {
  return dataPath("cache", `risk-${name}.json`);
}

export async function withCache<T = NormalizedRiskItem[]>(
  file: string,
  key: string,
  opts: { force?: boolean; maxAgeMs?: number; empty?: T },
  fetchLive: () => Promise<T>,
): Promise<CachedResult<T>> {
  const empty = (opts.empty ?? []) as T;
  const cache = await readJson<CacheFile<T>>(file, {});
  const entry = cache[key];
  const age = entry ? Date.now() - Date.parse(entry.fetchedAt) : Infinity;

  if (entry && !opts.force && age < (opts.maxAgeMs ?? REFRESH_MS)) {
    return { items: entry.items, status: "live", fetchedAt: entry.fetchedAt };
  }

  try {
    const items = await fetchLive();
    const fetchedAt = new Date().toISOString();
    const latest = await readJson<CacheFile<T>>(file, {});
    latest[key] = { fetchedAt, items };
    await writeJson(file, latest);
    return { items, status: "live", fetchedAt };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[risk] live fetch failed for ${file} (${key}): ${reason}`);
    if (entry) {
      return {
        items: entry.items,
        status: "cached",
        fetchedAt: entry.fetchedAt,
        message: `Live data unavailable. Showing saved results from ${entry.fetchedAt.slice(0, 10)}.`,
      };
    }
    return { items: empty, status: "unavailable", fetchedAt: null, message: "This source is unavailable right now." };
  }
}
