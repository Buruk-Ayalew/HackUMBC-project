import { useState } from "react";
import type { ObligationResult } from "../../../shared/types";
import { daysLabel, daysUntil, formatDate } from "./dates";
import { IconChevron, IconExternal } from "./icons";
import { FREQUENCY_LABELS } from "./schedule";

export function WhereLink({ r, className = "" }: { r: ObligationResult; className?: string }) {
  return (
    <a
      href={r.rule.filingUrl ?? r.rule.sourceUrl}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 font-medium text-brand-700 hover:underline ${className}`}
    >
      {r.rule.filingSiteName ?? "Official website"}
      <IconExternal className="shrink-0 text-xs" />
    </a>
  );
}

function When({ r }: { r: ObligationResult }) {
  const next = r.upcoming[0];
  if (!next) return <span className="text-slate-500">{r.rule.frequencyNote ?? (r.rule.frequency === "once" ? "As soon as you can" : "Check your date")}</span>;
  const n = daysUntil(next.date);
  return (
    <span>
      <span className="font-semibold text-slate-900">{formatDate(next.date)}</span>
      <span className={`block text-xs ${n <= 14 ? "font-semibold text-rose-600" : "text-slate-500"}`}>{daysLabel(next.date)}</span>
    </span>
  );
}

export function Details({ r }: { r: ObligationResult }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <p className="font-semibold text-slate-900">What to do</p>
        <p className="mt-1 text-slate-700">{r.rule.action}</p>
      </div>
      <p className="text-slate-600">{r.rule.summary}</p>
      {r.upcoming.length > 1 && (
        <p className="text-slate-600">
          <span className="font-medium text-slate-800">Next dates: </span>
          {r.upcoming
            .slice(0, 4)
            .map((u) => formatDate(u.date))
            .join(" · ")}
        </p>
      )}
      <p className="text-xs text-slate-500">
        Why we think this applies: {r.reasons.join(" ")}
        {r.coverageNote && <span className="text-amber-800"> {r.coverageNote}</span>}
      </p>
      <a href={r.rule.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
        Official source: {r.rule.sourceName} (checked {formatDate(r.rule.reviewedOn)}) <IconExternal />
      </a>
    </div>
  );
}

// Simple list of filings and renewals: what, how often, when, where.
export default function FilingSchedule({ results }: { results: ObligationResult[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
      <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold tracking-wide text-slate-500 uppercase md:grid">
        <span>What you need to do</span>
        <span>How often</span>
        <span>Next due</span>
        <span>Where to do it</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {results.map((r) => {
          const isOpen = open === r.rule.id;
          return (
            <li key={r.rule.id} className={isOpen ? "bg-slate-50/80" : ""}>
              <button
                onClick={() => toggle(r.rule.id)}
                aria-expanded={isOpen}
                className="grid w-full gap-x-4 gap-y-1 px-5 py-4 text-left transition hover:bg-slate-50 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] md:items-center"
              >
                <span className="flex items-start gap-2">
                  <IconChevron className={`mt-1 shrink-0 text-slate-400 transition ${isOpen ? "rotate-90" : ""}`} />
                  <span>
                    <span className="block font-semibold text-slate-900">{r.rule.title}</span>
                    <span className="block text-xs text-slate-500">{r.rule.agency}</span>
                  </span>
                </span>
                <span className="pl-6 text-sm text-slate-700 md:pl-0">
                  <span className="text-slate-500 md:hidden">How often: </span>
                  {r.rule.frequency ? FREQUENCY_LABELS[r.rule.frequency] : "—"}
                </span>
                <span className="pl-6 text-sm md:pl-0">
                  <span className="text-slate-500 md:hidden">Next due: </span>
                  <When r={r} />
                </span>
                <span className="pl-6 text-sm md:pl-0">
                  <WhereLink r={r} />
                </span>
              </button>
              {isOpen && (
                <div className="animate-fade-up px-5 pb-5 pl-11 md:max-w-3xl">
                  <Details r={r} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
