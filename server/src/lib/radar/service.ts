import type { BusinessProfile, RadarResponse } from "../../../../shared/types.js";
import { classifyItems } from "./classify.js";
import { getAllRadarItems, getRadarItems, type RadarItemsSnapshot } from "./index.js";

const SORT_WAIT_MS = 20000;
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
  // Wait briefly for sorting; anything not done yet shows as "might" and the page polls.
  const sorted = await classifyItems(snapshot.items, profile, SORT_WAIT_MS);
  const { sortingInProgress } = sorted;
  // Bills: show only the ones the sorter confirmed affect (or might affect)
  // this business. Bills it hasn't checked yet are held back, not guessed at.
  const unchecked = sorted.results.filter((r) => r.item.kind === "bill" && !r.autoSorted).length;
  const results = sorted.results.filter((r) => r.item.kind !== "bill" || (r.autoSorted && r.relevance !== "not_applicable"));
  const notices = [...snapshot.unavailableSources];
  if (unchecked > 0) {
    notices.push(
      sortingInProgress
        ? `${unchecked} bills are still being checked against your business. They'll appear here if they affect you.`
        : `Bill sorting is unavailable right now, so ${unchecked} bills haven't been checked against your business yet and aren't shown.`,
    );
  }
  results.sort((a, b) => ORDER[a.relevance] - ORDER[b.relevance] || sortKey(a) - sortKey(b));
  return {
    results,
    lastChecked: snapshot.fetchedAt,
    usingCachedData: snapshot.usingCachedData,
    savedResultsFrom: snapshot.savedResultsFrom,
    unavailableSources: notices,
    sortingInProgress,
  };
}
