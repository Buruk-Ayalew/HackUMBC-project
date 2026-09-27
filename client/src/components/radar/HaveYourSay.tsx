import type { RadarResult } from "../../../../shared/types";
import { daysUntil, formatDate, todayIso } from "./format";

interface Entry {
  result: RadarResult;
  label: string;
  date: string;
}

// Open comment periods and upcoming hearings for items that affect this business.
export default function HaveYourSay({ results }: { results: RadarResult[] }) {
  const today = todayIso();
  const entries: Entry[] = results
    .filter((r) => r.relevance === "affects")
    .flatMap((r) => [
      r.item.commentDeadline && r.item.commentDeadline >= today ? { result: r, label: "Comments due", date: r.item.commentDeadline } : null,
      r.item.hearingDate && r.item.hearingDate >= today ? { result: r, label: "Public hearing", date: r.item.hearingDate } : null,
    ])
    .filter((e): e is Entry => !!e)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
      <h2 className="text-lg font-semibold text-blue-900">Have your say</h2>
      <p className="text-sm text-blue-900/80">Open comment periods and hearings on changes that affect you.</p>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">No open comment periods or upcoming hearings right now.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {entries.map(({ result, label, date }) => {
            const days = daysUntil(date);
            return (
              <li key={`${result.item.id}-${label}`} className="rounded bg-white p-3 shadow-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">{result.item.title}</span>
                  <span className={`shrink-0 text-xs font-semibold ${days <= 7 ? "text-red-700" : "text-slate-600"}`}>
                    {days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"} left`}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {label}: {formatDate(date)}
                  {result.item.agency ? ` · ${result.item.agency}` : ""}
                </p>
                <a href={result.item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-blue-700 hover:underline">
                  How to comment (official page) ↗
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
