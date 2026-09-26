import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ObligationCategory, ObligationResult } from "../../../shared/types";
import ObligationCard, { CATEGORY_LABELS } from "../components/ObligationCard";
import { formatDate } from "../components/dates";
import { jurisdictionLabel } from "../components/profileOptions";
import { nextDeadlineOf, useObligations } from "../components/useObligations";

export default function ObligationsPage() {
  const { data, profile, error } = useObligations();
  const [category, setCategory] = useState<ObligationCategory | "all">("all");
  const [deadlineOnly, setDeadlineOnly] = useState(false);
  const [showNA, setShowNA] = useState(false);

  const filtered = useMemo(
    () =>
      (data?.results ?? []).filter(
        (r) => (category === "all" || r.rule.category === category) && (!deadlineOnly || (r.rule.deadlines?.length ?? 0) > 0),
      ),
    [data, category, deadlineOnly],
  );

  if (error) return <p className="rounded-md bg-red-50 p-4 text-red-800">{error}</p>;
  if (!data || !profile) return <p className="text-slate-500">Loading your obligations…</p>;

  const affects = filtered.filter((r) => r.status === "affects");
  const might = filtered.filter((r) => r.status === "might");
  const na = filtered.filter((r) => r.status === "not_applicable");
  const next = nextDeadlineOf(data.results);
  const totalAffects = data.results.filter((r) => r.status === "affects").length;
  const totalMight = data.results.filter((r) => r.status === "might").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{profile.businessName}</h1>
          <p className="text-slate-600">
            {jurisdictionLabel(profile.jurisdiction)}, Maryland · Profile updated {formatDate(profile.updatedAt)} ·{" "}
            <Link to="/settings" className="text-blue-700 underline">
              Edit details
            </Link>
          </p>
        </div>
        <Link to="/obligations/what-if" className="rounded-md border border-blue-700 px-4 py-2 font-medium text-blue-800 hover:bg-blue-50">
          What if I hire more people?
        </Link>
      </header>

      <div className="rounded-lg bg-slate-900 px-5 py-3 text-white">
        <strong>{totalAffects}</strong> obligations affect you · <strong>{totalMight}</strong> might
        {next && (
          <>
            {" "}
            · next deadline: <strong>{formatDate(next.date)}</strong> ({next.label})
          </>
        )}
      </div>

      {data.coverageNotes.map((n) => (
        <p key={n} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {n}
        </p>
      ))}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Category
          <select
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
            value={category}
            onChange={(e) => setCategory(e.target.value as ObligationCategory | "all")}
          >
            <option value="all">All</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={deadlineOnly} onChange={(e) => setDeadlineOnly(e.target.checked)} />
          Only items with a deadline
        </label>
      </div>

      <Group title="Affects you" count={affects.length} color="text-red-700" items={affects} empty="Nothing here with these filters." />
      <Group title="Might affect you" count={might.length} color="text-amber-700" items={might} empty="Nothing here with these filters." />

      <section>
        <button onClick={() => setShowNA(!showNA)} className="flex items-center gap-2 text-lg font-semibold text-slate-500">
          <span>{showNA ? "▾" : "▸"}</span> Doesn't apply ({na.length})
        </button>
        {showNA && (
          <div className="mt-3 space-y-3 opacity-80">
            {na.map((r) => (
              <ObligationCard key={r.rule.id} result={r} />
            ))}
          </div>
        )}
      </section>

      <p className="text-sm text-slate-500">Information, not legal advice. Always confirm with the official source.</p>
    </div>
  );
}

function Group({ title, count, color, items, empty }: { title: string; count: number; color: string; items: ObligationResult[]; empty: string }) {
  return (
    <section>
      <h2 className={`text-lg font-semibold ${color}`}>
        {title} ({count})
      </h2>
      <div className="mt-3 space-y-3">
        {items.length === 0 ? <p className="text-slate-500">{empty}</p> : items.map((r) => <ObligationCard key={r.rule.id} result={r} />)}
      </div>
    </section>
  );
}
