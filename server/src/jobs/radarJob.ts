import cron from "node-cron";
import { getAllRadarItems, getRadarItems } from "../lib/radar/index.js";
import { classifyItems } from "../lib/radar/classify.js";
import { dataPath, readJson } from "../lib/jsonStore.js";
import type { BusinessProfile } from "../../../shared/types.js";

// Daily at 6:00 AM Eastern: refresh every Radar source, then pre-sort the new
// items for every saved business so their Radar page loads instantly.
export async function runRadarRefresh() {
  const started = Date.now();
  try {
    const snapshot = await getAllRadarItems(true);
    const profiles = await readJson<BusinessProfile[]>(dataPath("profiles.json"), []);
    for (const p of profiles) await classifyItems(snapshot.items, p);
    console.log(`[radar] refreshed ${snapshot.items.length} items for ${profiles.length} profiles in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (err) {
    console.error("[radar] scheduled refresh failed", err);
  }
}

export function startRadarJob() {
  cron.schedule("0 6 * * *", runRadarRefresh, { timezone: "America/New_York" });
  // Warm up in the background on boot: fetches only stale sources and sorts
  // only items that aren't already in the classification cache.
  void warmUp();
}

async function warmUp() {
  try {
    const snapshot = await getRadarItems();
    const profiles = await readJson<BusinessProfile[]>(dataPath("profiles.json"), []);
    for (const p of profiles) await classifyItems(snapshot.items, p);
  } catch (err) {
    console.error("[radar] warm-up failed", err);
  }
}
