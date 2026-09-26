import { useMemo, useState } from "react";
import type { ObligationResult } from "../../../shared/types";
import { daysLabel, daysUntil, formatDate, parseDay, todayIso } from "../components/dates";
import { useObligations } from "../components/useObligations";

interface CalEvent {
  title: string;
  date: string;
  ruleId: string;
  ruleTitle: string;
  status: "affects" | "might";
  action: string;
  sourceUrl: string;
}

function collect(results: ObligationResult[]): CalEvent[] {
  return results
    .filter((r): r is ObligationResult & { status: "affects" | "might" } => r.status !== "not_applicable")
    .flatMap((r) =>
      (r.rule.deadlines ?? []).map((d) => ({
        title: d.label,
        date: d.date,
        ruleId: r.rule.id,
        ruleTitle: r.rule.title,
        status: r.status,
        action: r.rule.action,
        sourceUrl: r.rule.sourceUrl,
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

function googleLink(e: CalEvent): string {
  const start = e.date.replaceAll("-", "");
  const d = parseDay(e.date);
  d.setDate(d.getDate() + 1);
  const end = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${start}/${end}`,
    details: `What to do: ${e.action}\n\nOfficial source: ${e.sourceUrl}\n\nFrom CivicPulse MD. Information, not legal advice.`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

const DOT = { affects: "bg-red-600", might: "bg-amber-500" } as const;
const CHIP = { affects: "bg-red-100 text-red-900", might: "bg-amber-100 text-amber-900" } as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const { data, error } = useObligations();
  const events = useMemo(() => (data ? collect(data.results) : []), [data]);
  const [month, setMonth] = useState(() => {
    const t = parseDay(todayIso());
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });

  if (error) return <p className="rounded-md bg-red-50 p-4 text-red-800">{error}</p>;
  if (!data) return <p className="text-slate-500">Loading your deadlines…</p>;

  const upcoming = events.filter((e) => daysUntil(e.date) >= 0);
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const firstWeekday = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const today = todayIso();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Compliance calendar</h1>
        <a
          href="/api/obligations/calendar.ics"
          className="rounded-md bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
          download="civicpulse-deadlines.ics"
        >
          Download all (.ics)
        </a>
      </header>
      <p className="flex gap-4 text-sm text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-full ${DOT.affects}`} /> Affects you
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-full ${DOT.might}`} /> Might affect you
        </span>
      </p>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <button
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
              aria-label="Previous month"
            >
              ←
            </button>
            <h2 className="font-semibold">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
            <button
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
              aria-label="Next month"
            >
              →
            </button>
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 text-sm">
            {WEEKDAYS.map((d) => (
              <div key={d} className="bg-slate-50 p-1 text-center text-xs font-semibold text-slate-500">
                {d}
              </div>
            ))}
            {cells.map((day, i) => {
              const iso = day ? `${monthKey}-${String(day).padStart(2, "0")}` : "";
              const dayEvents = day ? events.filter((e) => e.date === iso) : [];
              return (
                <div key={i} className={`min-h-20 bg-white p-1 ${iso === today ? "ring-2 ring-blue-600 ring-inset" : ""}`}>
                  {day && <div className="text-xs text-slate-500">{day}</div>}
                  {dayEvents.map((e) => (
                    <div key={e.ruleId + e.title} className={`mt-0.5 truncate rounded px-1 text-xs ${CHIP[e.status]}`} title={e.title}>
                      {e.title}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Upcoming</h2>
          {upcoming.length === 0 ? (
            <p className="text-slate-500">No upcoming deadlines for your business.</p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((e) => (
                <li key={e.ruleId + e.title} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[e.status]}`} />
                    <span className="font-semibold">{formatDate(e.date)}</span>
                    <span className="text-sm text-slate-500">{daysLabel(e.date)}</span>
                  </div>
                  <p className="mt-1 text-sm">{e.title}</p>
                  {e.status === "might" && <p className="text-xs text-amber-800">Might apply to you</p>}
                  <div className="mt-2 flex gap-3 text-sm">
                    <a href={googleLink(e)} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                      Add to Google Calendar
                    </a>
                    <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                      Source ↗
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
