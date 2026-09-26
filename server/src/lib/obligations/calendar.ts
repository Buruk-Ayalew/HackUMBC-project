import { createEvents, type EventAttributes } from "ics";
import type { ObligationResult } from "../../../../shared/types.js";

export interface CalendarEvent {
  title: string;
  date: string; // YYYY-MM-DD
  ruleId: string;
  status: "affects" | "might";
  action: string;
  sourceUrl: string;
}

// Every deadline from "affects" and "might" results.
export function collectEvents(results: ObligationResult[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const r of results) {
    if (r.status === "not_applicable") continue;
    for (const d of r.rule.deadlines ?? []) {
      events.push({
        title: d.label,
        date: d.date,
        ruleId: r.rule.id,
        status: r.status,
        action: r.rule.action,
        sourceUrl: r.rule.sourceUrl,
      });
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export function buildIcs(events: CalendarEvent[]): string {
  const attrs: EventAttributes[] = events.map((e) => {
    const [y, m, d] = e.date.split("-").map(Number) as [number, number, number];
    // All-day event: DTEND is the following day (exclusive).
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    return {
      uid: `${e.ruleId}-${e.date}@civicpulse-md`,
      title: e.status === "might" ? `${e.title} (might apply)` : e.title,
      start: [y, m, d],
      end: [next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()],
      description: `What to do: ${e.action}\n\nOfficial source: ${e.sourceUrl}\n\nFrom CivicPulse MD. Information, not legal advice.`,
      url: e.sourceUrl,
      categories: ["Compliance"],
      productId: "civicpulse-md/obligations",
    };
  });
  const { error, value } = createEvents(attrs);
  if (error || !value) throw error ?? new Error("Could not build calendar file");
  return value;
}
