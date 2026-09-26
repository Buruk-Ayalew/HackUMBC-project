import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { BusinessProfile, ObligationResult, ObligationsResponse } from "../../../shared/types";
import { apiPost } from "../api";
import { employeeErrors } from "../components/profileOptions";
import { useObligations } from "../components/useObligations";

const MAX = 100;
type Counts = Omit<BusinessProfile["employees"], "coveredByFMLA">;

const RANK = { not_applicable: 0, might: 1, affects: 2 } as const;
const STATUS_TEXT = { affects: "applies", might: "might apply", not_applicable: "doesn't apply" } as const;

interface Change {
  result: ObligationResult;
  from: ObligationResult["status"];
}

function diff(base: ObligationResult[], next: ObligationResult[]) {
  const before = new Map(base.map((r) => [r.rule.id, r.status]));
  const turnedOn: Change[] = [];
  const turnedOff: Change[] = [];
  for (const r of next) {
    const from = before.get(r.rule.id) ?? "not_applicable";
    if (from === r.status) continue;
    (RANK[r.status] > RANK[from] ? turnedOn : turnedOff).push({ result: r, from });
  }
  return { turnedOn, turnedOff };
}

export default function WhatIfPage() {
  const { data: baseline, profile, error } = useObligations();
  const [mode, setMode] = useState<"single" | "separate">("single");
  const [slider, setSlider] = useState<number | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [whatIf, setWhatIf] = useState<ObligationsResponse | null>(null);
  const [reqError, setReqError] = useState<string | null>(null);

  // Initialise from the saved profile.
  useEffect(() => {
    if (!profile) return;
    const { coveredByFMLA: _f, ...c } = profile.employees;
    setCounts(c);
    setSlider(Math.min(profile.employees.inMaryland, MAX));
  }, [profile]);

  // Single slider: scale full-time by today's ratio; total never drops below today's.
  const effective: Counts | null = useMemo(() => {
    if (!profile || slider === null || !counts) return null;
    if (mode === "separate") return counts;
    const e = profile.employees;
    const ratio = e.inMaryland > 0 ? e.fullTimeInMaryland / e.inMaryland : 1;
    return {
      inMaryland: slider,
      fullTimeInMaryland: Math.min(slider, Math.round(slider * ratio)),
      totalAllStates: Math.max(e.totalAllStates, slider),
    };
  }, [profile, slider, counts, mode]);

  const validation = effective ? employeeErrors({ ...effective, coveredByFMLA: "unsure" }) : null;

  // Debounced what-if request.
  useEffect(() => {
    if (!effective || validation) return;
    const t = setTimeout(() => {
      apiPost<ObligationsResponse>("/api/obligations/what-if", { employees: effective })
        .then((r) => {
          setWhatIf(r);
          setReqError(null);
        })
        .catch((e) => setReqError((e as Error).message));
    }, 300);
    return () => clearTimeout(t);
  }, [effective?.inMaryland, effective?.fullTimeInMaryland, effective?.totalAllStates, validation]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="rounded-md bg-red-50 p-4 text-red-800">{error}</p>;
  if (!baseline || !profile || slider === null || !counts || !effective) return <p className="text-slate-500">Loading…</p>;

  const { turnedOn, turnedOff } = whatIf ? diff(baseline.results, whatIf.results) : { turnedOn: [], turnedOff: [] };
  const markers = baseline.thresholds.filter((t) => t > 0 && t <= MAX);
  const sameAsToday =
    effective.inMaryland === profile.employees.inMaryland &&
    effective.fullTimeInMaryland === profile.employees.fullTimeInMaryland &&
    effective.totalAllStates === profile.employees.totalAllStates;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/obligations" className="text-sm text-blue-700 underline">
          ← Back to obligations
        </Link>
        <h1 className="mt-2 text-2xl font-bold">What if I hire more people?</h1>
        <p className="text-slate-600">
          Today you have {profile.employees.inMaryland} employees in Maryland ({profile.employees.fullTimeInMaryland} full-time) and{" "}
          {profile.employees.totalAllStates} in total.
        </p>
      </div>

      <div className="flex gap-2 text-sm">
        {(["single", "separate"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md border px-3 py-1.5 ${mode === m ? "border-blue-700 bg-blue-50 font-semibold text-blue-800" : "border-slate-300 bg-white"}`}
          >
            {m === "single" ? "One slider" : "Set the three counts separately"}
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {mode === "single" ? (
          <>
            <label htmlFor="headcount" className="font-medium">
              Employees in Maryland: <span className="text-2xl font-bold text-blue-800">{slider}</span>
            </label>
            <div className="relative mt-6">
              {markers.map((m) => (
                <div
                  key={m}
                  className="absolute -top-5 -translate-x-1/2 text-xs font-semibold text-amber-700"
                  style={{ left: `${(m / MAX) * 100}%` }}
                  title={`Something changes at ${m}`}
                >
                  {m}
                  <div className="mx-auto h-2 w-px bg-amber-500" />
                </div>
              ))}
              <input
                id="headcount"
                type="range"
                min={0}
                max={MAX}
                value={slider}
                onChange={(e) => setSlider(Number(e.target.value))}
                className="w-full accent-blue-700"
              />
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Orange marks show where a rule changes. We assume {effective.fullTimeInMaryland} full-time and{" "}
              {effective.totalAllStates} employees in all states at this size.
            </p>
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["totalAllStates", "Total, all states"],
                ["inMaryland", "In Maryland"],
                ["fullTimeInMaryland", "Full-time in Maryland"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="block text-sm font-medium">
                {label}
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={counts[k]}
                  onChange={(e) => setCounts({ ...counts, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                />
              </label>
            ))}
          </div>
        )}
        {validation && <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-800">{validation}</p>}
        {reqError && <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-800">{reqError}</p>}
      </section>

      <section className="space-y-4">
        {sameAsToday ? (
          <p className="text-slate-600">Move the slider to see what changes compared with today.</p>
        ) : (
          <>
            <h2 className="text-lg font-semibold">
              At {effective.inMaryland} employees, {turnedOn.length} {turnedOn.length === 1 ? "obligation changes" : "obligations change"} toward applying
              {turnedOff.length > 0 && ` and ${turnedOff.length} ${turnedOff.length === 1 ? "stops" : "stop"} applying`}:
            </h2>
            {turnedOn.length === 0 && turnedOff.length === 0 && <p className="text-slate-600">No changes from today.</p>}
            <ChangeList items={turnedOn} tone="on" />
            <ChangeList items={turnedOff} tone="off" />
          </>
        )}
      </section>

      <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-600">
        Each law counts employees differently. These are estimates; check each rule's source.
      </p>
    </div>
  );
}

function ChangeList({ items, tone }: { items: Change[]; tone: "on" | "off" }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-3">
      {items.map(({ result, from }) => (
        <li
          key={result.rule.id}
          className={`rounded-lg border-l-4 bg-white p-4 shadow-sm ${tone === "on" ? (result.status === "affects" ? "border-l-red-600" : "border-l-amber-500") : "border-l-slate-400"}`}
        >
          <p className="font-semibold">{result.rule.title}</p>
          <p className="text-sm text-slate-600">
            Today: {STATUS_TEXT[from]} → then: <strong>{STATUS_TEXT[result.status]}</strong>
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
            {result.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <a href={result.rule.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-700 underline">
            Official source ↗
          </a>
        </li>
      ))}
    </ul>
  );
}
