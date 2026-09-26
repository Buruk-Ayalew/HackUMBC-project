import { Fragment, useState } from "react";
import type { ObligationResult } from "../../../shared/types";
import { formatDate } from "./dates";
import { IconChevron, IconExternal } from "./icons";
import { FREQUENCY_LABELS, groupByAgency, scheduleStatus } from "./schedule";
import { Badge } from "./ui";

function NextDue({ r }: { r: ObligationResult }) {
  const next = r.upcoming[0];
  if (next) {
    return (
      <div>
        <p className="font-semibold whitespace-nowrap text-slate-900">{formatDate(next.date)}</p>
        {r.upcoming.length > 1 && <p className="text-xs text-slate-500">then {formatDate(r.upcoming[1]!.date)}</p>}
      </div>
    );
  }
  return <p className="text-sm text-slate-500">{r.rule.frequencyNote ?? (r.rule.frequency === "once" ? "Do it now" : "No fixed date")}</p>;
}

function WhereToFile({ r }: { r: ObligationResult }) {
  const url = r.rule.filingUrl ?? r.rule.sourceUrl;
  const name = r.rule.filingSiteName ?? "Official source";
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
    >
      {name}
      <IconExternal className="shrink-0 text-xs" />
    </a>
  );
}

function Details({ r }: { r: ObligationResult }) {
  return (
    <div className="grid gap-5 text-sm md:grid-cols-[3fr_2fr]">
      <div className="space-y-3">
        <p className="text-slate-700">{r.rule.summary}</p>
        <div>
          <p className="font-semibold text-slate-900">What to do</p>
          <p className="text-slate-700">{r.rule.action}</p>
        </div>
        <div>
          <p className="font-semibold text-slate-900">Why this shows up for you</p>
          <ul className="mt-1 space-y-0.5 text-slate-600">
            {r.reasons.map((x) => (
              <li key={x} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                {x}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="space-y-3">
        {r.upcoming.length > 0 && (
          <div>
            <p className="font-semibold text-slate-900">Upcoming dates</p>
            <ul className="mt-1 space-y-1">
              {r.upcoming.slice(0, 5).map((u) => (
                <li key={u.date + u.label} className="flex justify-between gap-3 text-slate-600">
                  <span className="truncate">{u.label}</span>
                  <span className="shrink-0 font-medium text-slate-800">{formatDate(u.date)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {r.coverage === "reviewed" ? <Badge tone="green">Reviewed {formatDate(r.rule.reviewedOn)}</Badge> : <Badge tone="amber">Coverage limited</Badge>}
          {r.coverageNote && <span className="text-xs text-amber-800">{r.coverageNote}</span>}
        </div>
        <a href={r.rule.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
          Source: {r.rule.sourceName} <IconExternal className="shrink-0 text-xs" />
        </a>
      </div>
    </div>
  );
}

export default function FilingSchedule({ results }: { results: ObligationResult[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = groupByAgency(results);
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="py-3 pr-3 pl-5">Obligation</th>
              <th className="px-3 py-3">How often</th>
              <th className="px-3 py-3">Next due</th>
              <th className="px-3 py-3">Status</th>
              <th className="py-3 pr-5 pl-3">Where to file</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.agency}>
                <tr className="border-t border-slate-200 bg-slate-50/60">
                  <td colSpan={5} className="px-5 py-2 text-xs font-bold tracking-wide text-slate-700 uppercase">
                    {g.agency} <span className="font-medium text-slate-400">· {g.items.length}</span>
                  </td>
                </tr>
                {g.items.map((r) => {
                  const s = scheduleStatus(r);
                  const isOpen = open === r.rule.id;
                  return (
                    <Fragment key={r.rule.id}>
                      <tr
                        onClick={() => toggle(r.rule.id)}
                        className={`cursor-pointer border-t border-slate-100 align-top transition hover:bg-brand-50/40 ${isOpen ? "bg-brand-50/40" : ""}`}
                        aria-expanded={isOpen}
                      >
                        <td className="py-3.5 pr-3 pl-5">
                          <div className="flex items-start gap-2">
                            <IconChevron className={`mt-0.5 shrink-0 text-slate-400 transition ${isOpen ? "rotate-90" : ""}`} />
                            <span className="font-medium text-slate-900">{r.rule.title}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <p className="font-medium whitespace-nowrap text-slate-800">{r.rule.frequency ? FREQUENCY_LABELS[r.rule.frequency] : "—"}</p>
                          {r.rule.frequencyNote && r.upcoming.length > 0 && <p className="max-w-44 text-xs text-slate-500">{r.rule.frequencyNote}</p>}
                        </td>
                        <td className="px-3 py-3.5">
                          <NextDue r={r} />
                        </td>
                        <td className="px-3 py-3.5">
                          <Badge tone={s.tone} dot>
                            {s.label}
                          </Badge>
                        </td>
                        <td className="py-3.5 pr-5 pl-3">
                          <WhereToFile r={r} />
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-brand-50/40">
                          <td colSpan={5} className="animate-fade-up px-5 pt-1 pb-5 pl-11">
                            <Details r={r} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-6 md:hidden">
        {groups.map((g) => (
          <section key={g.agency}>
            <h3 className="mb-2 text-xs font-bold tracking-wide text-slate-600 uppercase">{g.agency}</h3>
            <div className="space-y-2">
              {g.items.map((r) => {
                const s = scheduleStatus(r);
                const isOpen = open === r.rule.id;
                return (
                  <div key={r.rule.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
                    <button className="w-full text-left" onClick={() => toggle(r.rule.id)} aria-expanded={isOpen}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-slate-900">{r.rule.title}</p>
                        <Badge tone={s.tone} dot>
                          {s.label}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                        <span>{r.rule.frequency ? FREQUENCY_LABELS[r.rule.frequency] : ""}</span>
                        {r.upcoming[0] && <span className="font-medium text-slate-900">Next: {formatDate(r.upcoming[0].date)}</span>}
                      </div>
                    </button>
                    <div className="mt-2">
                      <WhereToFile r={r} />
                    </div>
                    {isOpen && (
                      <div className="mt-4 animate-fade-up border-t border-slate-100 pt-4">
                        <Details r={r} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
