import type { RadarResult } from "../../../../shared/types";
import { KIND_LABEL, SOURCE_LABEL, formatDate } from "./format";

const ACCENT = {
  affects: "border-l-red-500",
  might: "border-l-amber-400",
  not_applicable: "border-l-slate-300",
} as const;

export default function RadarCard({ result }: { result: RadarResult }) {
  const { item } = result;
  const dates = [
    item.effectiveDate && { label: "Takes effect", value: item.effectiveDate },
    item.commentDeadline && { label: "Comments due", value: item.commentDeadline },
    item.hearingDate && { label: "Hearing", value: item.hearingDate },
    item.publishedDate && { label: "Published", value: item.publishedDate },
  ].filter((d): d is { label: string; value: string } => !!d);

  return (
    <article className={`rounded-lg border border-slate-200 border-l-4 bg-white p-4 shadow-sm ${ACCENT[result.relevance]}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-blue-50 px-2 py-0.5 font-medium text-blue-800">{SOURCE_LABEL[item.source]}</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">{KIND_LABEL[item.kind]}</span>
        {item.isNew && <span className="rounded bg-green-100 px-2 py-0.5 font-medium text-green-800">New</span>}
        {item.citation && <span className="text-slate-500">{item.citation}</span>}
      </div>
      <h3 className="mt-2 font-semibold text-slate-900">{item.title}</h3>
      {item.agency && <p className="text-sm text-slate-500">{item.agency}</p>}
      <p className="mt-2 text-sm text-slate-700">{item.summary}</p>
      <p className="mt-2 text-sm">
        <span className="font-medium text-slate-800">Why: </span>
        <span className={result.autoSorted ? "text-slate-700" : "italic text-slate-500"}>{result.reason}</span>
      </p>
      {result.actionNeeded && (
        <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">{result.actionNeeded}</p>
      )}
      {dates.length > 0 && (
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {dates.map((d) => (
            <div key={d.label} className="flex gap-1">
              <dt className="text-slate-500">{d.label}:</dt>
              <dd className="font-medium text-slate-800">{formatDate(d.value)}</dd>
            </div>
          ))}
        </dl>
      )}
      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-sm font-medium text-blue-700 hover:underline"
      >
        View official source ↗
      </a>
    </article>
  );
}
