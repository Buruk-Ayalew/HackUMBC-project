import type { BusinessProfile, RadarResponse } from "../../../../shared/types.js";
import { classifyItems } from "./classify.js";
import { getAllRadarItems, getRadarItems, type RadarItemsSnapshot } from "./index.js";

const ORDER = { affects: 0, might: 1, not_applicable: 2 } as const;

// Soonest upcoming date first, then most recently published.
function sortKey(r: RadarResponse["results"][number]): number {
  const today = new Date().toISOString().slice(0, 10);
  const dates = [r.item.commentDeadline, r.item.hearingDate, r.item.effectiveDate].filter((d): d is string => !!d && d >= today);
  if (dates.length) return Date.parse(dates.sort()[0]);
  return 8.64e15 - Date.parse(r.item.publishedDate ?? r.item.fetchedAt);
}

export async function buildRadarResponse(profile: BusinessProfile, forceRefresh = false): Promise<RadarResponse> {
  const snapshot: RadarItemsSnapshot = forceRefresh ? await getAllRadarItems(true) : await getRadarItems();
  const results = await classifyItems(snapshot.items, profile);
  results.sort((a, b) => ORDER[a.relevance] - ORDER[b.relevance] || sortKey(a) - sortKey(b));
  return {
    results,
    lastChecked: snapshot.fetchedAt,
    usingCachedData: snapshot.usingCachedData,
    savedResultsFrom: snapshot.savedResultsFrom,
    unavailableSources: snapshot.unavailableSources,
  };
}
