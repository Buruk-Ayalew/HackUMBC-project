import { forwardRef } from "react";
import type { RiskItem } from "../../../../shared/types";
import { CATEGORY_LABEL, formatDate, formatDistance, LEVEL_BADGE, LEVEL_LABEL } from "./format";

interface Props {
  item: RiskItem;
  selected: boolean;
  onSelect: () => void;
}

const RiskItemCard = forwardRef<HTMLLIElement, Props>(function RiskItemCard({ item, selected, onSelect }, ref) {
  const start = formatDate(item.startDate);
  const end = formatDate(item.endDate);
  return (
    <li
      ref={ref}
      onClick={onSelect}
      className={`cursor-pointer rounded-lg border bg-white p-4 transition ${
        selected ? "border-blue-600 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${LEVEL_BADGE[item.riskLevel]}`}>
          {LEVEL_LABEL[item.riskLevel]}
        </span>
        {item.isNew && <span className="rounded-full bg-blue-600 px-2 py-0.5 font-semibold text-white">New</span>}
        <span className="text-slate-500">{CATEGORY_LABEL[item.category]}</span>
        <span className="ml-auto font-medium text-slate-700">{formatDistance(item.distanceMeters)}</span>
      </div>

      <h3 className="mt-2 font-semibold text-slate-900">{item.title}</h3>
      {item.address && item.address !== item.title && <p className="text-sm text-slate-500">{item.address}</p>}

      <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
        {item.riskReasons.map((r) => (
          <li key={r} className="flex gap-1.5">
            <span aria-hidden className="text-slate-400">•</span>
            {r}
          </li>
        ))}
      </ul>

      {item.description && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{item.description}</p>}

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-slate-500">
        {item.status && (
          <>
            <dt className="font-medium">Status</dt>
            <dd>{item.status}</dd>
          </>
        )}
        {(start || end) && (
          <>
            <dt className="font-medium">Dates</dt>
            <dd>{[start && `From ${start}`, end && `until ${end}`].filter(Boolean).join(" ")}</dd>
          </>
        )}
        {item.reference && (
          <>
            <dt className="font-medium">Reference</dt>
            <dd>{item.reference}</dd>
          </>
        )}
      </dl>
      {item.dateNote && <p className="mt-1 text-xs italic text-slate-500">{item.dateNote}</p>}

      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-3 inline-block text-sm font-medium text-blue-700 hover:underline"
      >
        Official source: {item.sourceName} ↗
      </a>
    </li>
  );
});

export default RiskItemCard;
