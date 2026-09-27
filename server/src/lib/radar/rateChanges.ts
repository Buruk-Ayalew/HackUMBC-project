// Wage and tax-rate changes found by the Obligations module's daily live checks
// of official pages (MD Labor, FAMLI, DLS). Each change becomes a Radar item;
// the sorter decides which businesses it affects, like any other item.

import type { ValueChange } from "../obligations/live/changes.js";
import { getValueChanges } from "../obligations/live/index.js";
import { formatLongDate, type RadarItemInternal, type SourceResult } from "./common.js";

export function changeToItem(c: ValueChange, fetchedAt: string): RadarItemInternal {
  const when = c.effectiveDate ? ` It takes effect ${formatLongDate(c.effectiveDate)}.` : "";
  const summary = `Our daily check of the official page found the ${c.label} changed from ${c.from} to ${c.to}.${when}`;
  return {
    id: `rate-${c.id.replace(/[^A-Za-z0-9.$%-]+/g, "_")}`,
    source: "rate_change",
    title: `${c.label} changed: ${c.from} → ${c.to}`,
    agency: c.agency,
    kind: "news",
    citation: null,
    summary,
    publishedDate: c.detectedAt.slice(0, 10),
    effectiveDate: c.effectiveDate,
    commentDeadline: null,
    hearingDate: null,
    sourceUrl: c.sourceUrl,
    fetchedAt,
    context: `${summary} Businesses that pay this wage or collect this tax need to update payroll or pricing.`,
  };
}

export async function fetchRateChanges(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const changes = await getValueChanges();
  return { source: "Live wage and tax-rate checks", items: changes.map((c) => changeToItem(c, fetchedAt)), fetchedAt, fromFallback: false };
}
