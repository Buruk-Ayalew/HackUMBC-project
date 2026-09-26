import cron from "node-cron";
import type { BusinessProfile } from "../../../shared/types.js";
import { dataPath, readJson } from "../lib/jsonStore.js";
import { DEFAULT_RADIUS_M, searchLocalRisk } from "../lib/risk/search.js";

// Every 12 hours, refresh Local Risk for every saved business. Caches expire after
// 12 hours, so this refetches stale sources without forcing (statewide sources are
// fetched once, not once per business). Also updates "new nearby" tracking.
export async function refreshAllLocalRisk(): Promise<void> {
  const profiles = await readJson<BusinessProfile[]>(dataPath("profiles.json"), []);
  for (const profile of profiles) {
    try {
      await searchLocalRisk(profile, { radiusMeters: DEFAULT_RADIUS_M, userId: profile.userId });
    } catch (err) {
      console.warn(`[riskJob] refresh failed for profile ${profile.id}:`, err);
    }
  }
  console.log(`[riskJob] refreshed Local Risk for ${profiles.length} business(es)`);
}

export function startRiskJob(): void {
  // 5:30 and 17:30 Eastern.
  cron.schedule("30 5,17 * * *", () => void refreshAllLocalRisk(), { timezone: "America/New_York" });
}
