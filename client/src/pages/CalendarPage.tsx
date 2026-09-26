import { useMemo, useState } from "react";
import { daysLabel, daysUntil, formatDate, parseDay, todayIso } from "../components/dates";
import { IconCalendar, IconDownload, IconExternal } from "../components/icons";
import { LiveStatusBar, VerificationBadge } from "../components/LiveStatus";
import { allUpcoming, type UpcomingItem } from "../components/schedule";
import { Badge, Card, LoadingPage, Notice, PageHeader, buttonStyles } from "../components/ui";
import { useObligations } from "../components/useObligations";

function googleLink(e: UpcomingItem): string {
  const start = e.date.replaceAll("-", "");
  const d = parseDay(e.date);
  d.setDate(d.getDate() + 1);
  const end = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.label,
    dates: `${start}/${end}`,
    details: `What to do: ${e.result.rule.action}\n\nOfficial source: ${e.result.rule.sourceUrl}\n\nFrom CivicPulse MD. Information, not legal advice.`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

const CHIP = {
  affects: "bg-rose-100 text-rose-800 hover:bg-rose-200",
  might: "bg-amber-100 text-amber-900 hover:bg-amber-200",
} as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const { data, error, checking, checkNow } = useObligations();
  const events = useMemo(() => (data ? allUpcoming(data.results) : []), [data]);
  const [month, setMonth] = useState(() => {
    const t = parseDay(todayIso());
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);

  if (error) return <Notice tone="red">{error}</Notice>;
  if (!data) return <LoadingPage />;

  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const firstWeekday = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = todayIso();
  const list = selected ? events.filter((e) => e.date === selected) : events;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <PageHeader
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <IconCalendar /> Compliance calendar
            </span>
          }
          title="Your deadlines"
          subtitle="Every filing, payment, and renewal due in the next 12 months."
          actions={
            <a href="/api/obligations/calendar.ics" download="civicpulse-deadlines.ics" className={buttonStyles.primary}>
              <IconDownload /> Download all (.ics)
            </a>
          }
        />
        <LiveStatusBar data={data} checking={checking} onCheck={checkNow} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className={buttonStyles.secondary + " px-3 py-1.5"}
              aria-label="Previous month"
            >
              ←
            </button>
            <h2 className="text-lg font-bold text-slate-900">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
            <button
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className={buttonStyles.secondary + " px-3 py-1.5"}
              aria-label="Next month"
            >
              →
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-sm">
            {WEEKDAYS.map((d) => (
              <div key={d} className="pb-1 text-center text-xs font-semibold text-slate-400">
                {d}
              </div>
            ))}
            {cells.map((day, i) => {
              const iso = day ? `${monthKey}-${String(day).padStart(2, "0")}` : "";
              const dayEvents = day ? events.filter((e) => e.date === iso) : [];
              const isSel = selected === iso;
              return (
                <button
                  key={i}
                  disabled={!day}
                  onClick={() => setSelected(isSel || !dayEvents.length ? null : iso)}
                  className={`min-h-20 rounded-xl border p-1.5 text-left align-top transition sm:min-h-24 ${
                    !day
                      ? "border-transparent"
                      : isSel
                        ? "border-brand-500 bg-brand-50"
                        : iso === today
                          ? "border-brand-300 bg-white"
                          : "border-slate-100 bg-white hover:border-slate-300"
                  }`}
                >
                  {day && (
                    <span className={`text-xs font-semibold ${iso === today ? "rounded-full bg-brand-600 px-1.5 py-0.5 text-white" : "text-slate-500"}`}>
                      {day}
                    </span>
                  )}
                  {dayEvents.slice(0, 2).map((e) => (
                    <span key={e.label} className={`mt-1 block truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ${CHIP[e.result.status as "affects" | "might"]}`} title={e.label}>
                      {e.label}
                    </span>
                  ))}
                  {dayEvents.length > 2 && <span className="mt-0.5 block text-[11px] font-medium text-slate-500">+{dayEvents.length - 2} more</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> Applies to you
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Might apply
            </span>
          </div>
        </Card>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">{selected ? formatDate(selected) : "Upcoming"}</h2>
            {selected && (
              <button onClick={() => setSelected(null)} className="text-sm font-semibold text-brand-700 hover:underline">
                Show all
              </button>
            )}
          </div>
          {list.length === 0 ? (
            <p className="text-slate-500">No upcoming deadlines for your business.</p>
          ) : (
            <ul className="max-h-[42rem] space-y-2 overflow-y-auto pr-1">
              {list.map((e) => {
                const soon = daysUntil(e.date) <= 14;
                return (
                  <li key={e.date + e.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-bold ${soon ? "text-rose-700" : "text-slate-900"}`}>{formatDate(e.date)}</span>
                      <span className="text-xs text-slate-500">{daysLabel(e.date)}</span>
                    </div>
                    <p className="mt-1 font-medium text-slate-900">{e.label}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{e.result.rule.agency}</span>
                      {e.result.status === "might" && <Badge tone="amber">Might apply</Badge>}
                      <VerificationBadge v={e.result.verification} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4 text-sm">
                      <a href={googleLink(e)} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">
                        + Google Calendar
                      </a>
                      <a href={e.result.rule.filingUrl ?? e.result.rule.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
                        {e.result.rule.filingSiteName ?? "Source"} <IconExternal className="text-xs" />
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
