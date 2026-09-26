import type { ObligationCategory, ObligationResult } from "../../../shared/types";
import { daysLabel, daysUntil, formatDate } from "./dates";

export const CATEGORY_LABELS: Record<ObligationCategory, string> = {
  employment: "Employment",
  tax: "Tax",
  registration: "Registration",
  licensing: "Licensing",
  posting: "Posting & notices",
  privacy: "Privacy",
};

const ACCENT: Record<ObligationResult["status"], string> = {
  affects: "border-l-red-600",
  might: "border-l-amber-500",
  not_applicable: "border-l-slate-300",
};

export default function ObligationCard({ result }: { result: ObligationResult }) {
  const { rule, reasons, coverage, coverageNote, status } = result;
  return (
    <article className={`rounded-lg border border-l-4 border-slate-200 bg-white p-5 shadow-sm ${ACCENT[status]}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900">{rule.title}</h3>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
          {CATEGORY_LABELS[rule.category]}
        </span>
      </div>
      <p className="mt-2 text-slate-700">{rule.summary}</p>

      <div className="mt-3">
        <h4 className="text-sm font-semibold text-slate-800">Why</h4>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>

      {status !== "not_applicable" && (
        <div className="mt-3">
          <h4 className="text-sm font-semibold text-slate-800">What you need to do</h4>
          <p className="text-sm text-slate-700">{rule.action}</p>
        </div>
      )}

      {rule.deadlines && rule.deadlines.length > 0 && status !== "not_applicable" && (
        <ul className="mt-3 space-y-1">
          {rule.deadlines.map((d) => {
            const n = daysUntil(d.date);
            return (
              <li key={d.label + d.date} className="flex flex-wrap items-center gap-2 text-sm">
                <span
                  className={`rounded px-2 py-0.5 font-semibold ${n < 0 ? "bg-slate-100 text-slate-500" : n <= 30 ? "bg-red-100 text-red-800" : "bg-blue-50 text-blue-800"}`}
                >
                  {formatDate(d.date)}
                </span>
                <span className="text-slate-700">{d.label}</span>
                <span className="text-slate-500">({daysLabel(d.date)})</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-sm">
        {coverage === "reviewed" ? (
          <span className="rounded bg-green-50 px-2 py-0.5 text-green-800">Reviewed {formatDate(rule.reviewedOn)}</span>
        ) : (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-900">Coverage limited</span>
        )}
        {coverageNote && <span className="text-amber-900">{coverageNote}</span>}
        <a href={rule.sourceUrl} target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline">
          Official source: {rule.sourceName} ↗
        </a>
      </div>
    </article>
  );
}
