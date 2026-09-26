import { loadRules } from "./obligations/rules.js";
import { getLiveData, refreshLiveData } from "./obligations/live/index.js";
import { getProfileForUser } from "./profile.js";
import { classifyItems } from "./radar/classify.js";
import { getAllRadarItems, getRadarItems } from "./radar/index.js";
import { DEFAULT_RADIUS_M, searchLocalRisk } from "./risk/search.js";

// On every login, refresh the user's obligations checks, Radar, and Local Risk
// in the background so their pages show up-to-date results. To stay polite to
// government sites, a login only refetches from the sources if no login did so
// in the last 15 minutes; otherwise it reuses those fresh results.

const MIN_GAP_MS = 15 * 60 * 1000;
let lastForcedAt = 0;

export function refreshOnLogin(userId: string): void {
  void (async () => {
    const profile = await getProfileForUser(userId);
    if (!profile) return; // nothing to refresh until setup is done
    const force = Date.now() - lastForcedAt >= MIN_GAP_MS;
    if (force) lastForcedAt = Date.now();
    const started = Date.now();

    const settled = await Promise.allSettled([
      loadRules().then((rules) => (force ? refreshLiveData(rules) : getLiveData(rules, 0))),
      (force ? getAllRadarItems(true) : getRadarItems()).then((snapshot) => classifyItems(snapshot.items, profile)),
      searchLocalRisk(profile, { radiusMeters: DEFAULT_RADIUS_M, force, userId }),
    ]);
    const failed = ["obligations", "radar", "local risk"].filter((_, i) => settled[i]!.status === "rejected");
    console.log(
      `[login] ${force ? "refreshed" : "reused recent"} data for ${profile.businessName} in ${Math.round((Date.now() - started) / 1000)}s` +
        (failed.length ? `; failed: ${failed.join(", ")}` : ""),
    );
  })().catch((err) => console.error("[login] background refresh failed", err));
}
