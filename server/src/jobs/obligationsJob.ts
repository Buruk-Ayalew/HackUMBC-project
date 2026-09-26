import cron from "node-cron";
import { loadRules } from "../lib/obligations/rules.js";
import { getLiveData, refreshLiveData } from "../lib/obligations/live/index.js";

// Daily at 5:30 AM Eastern: re-read live values (tax rates, minimum wages,
// FAMLI rate) and re-check every rule against its official source page.
export async function runObligationsRefresh() {
  try {
    await refreshLiveData(await loadRules());
  } catch (err) {
    console.error("[obligations] scheduled refresh failed", err);
  }
}

export function startObligationsJob() {
  cron.schedule("30 5 * * *", runObligationsRefresh, { timezone: "America/New_York" });
  // Warm up on boot: refreshes only if the saved results are old.
  void loadRules()
    .then((rules) => getLiveData(rules, 0))
    .catch((err) => console.error("[obligations] warm-up failed", err));
}
