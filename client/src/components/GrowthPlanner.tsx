import { useEffect, useMemo, useState } from "react";
import type { BusinessProfile, Milestone, ObligationResult, ObligationsResponse } from "../../../shared/types";
import { apiPost } from "../api";
import { IconCheck, IconExternal, IconMinus, IconPlus } from "./icons";
import { employeeErrors } from "./profileOptions";
import { Badge } from "./ui";

const MAX = 100;
const THUMB = 26; // px, must match .headcount-range thumb size in index.css
const LABEL_GAP = 5; // min headcount gap between labels so they don't overlap
type Counts = Omit<BusinessProfile["employees"], "coveredByFMLA">;

const RANK = { not_applicable: 0, might: 1, affects: 2 } as const;

export function scaledCounts(profile: BusinessProfile, n: number): Counts {
  const e = profile.employees;
  const ratio = e.inMaryland > 0 ? e.fullTimeInMaryland / e.inMaryland : 1;
  return {
    inMaryland: n,
    fullTimeInMaryland: Math.min(n, Math.round(n * ratio)),
    totalAllStates: Math.max(e.totalAllStates, n),
  };
}

interface Change {
  result: ObligationResult;
  from: ObligationResult["status"];
}

function diff(base: ObligationResult[], next: ObligationResult[]) {
  const before = new Map(base.map((r) => [r.rule.id, r.status]));
  const starts: Change[] = [];
  const maybe: Change[] = [];
  const stops: Change[] = [];
  for (const r of next) {
    const from = before.get(r.rule.id) ?? "not_applicable";
    if (from === r.status) continue;
    if (RANK[r.status] < RANK[from]) stops.push({ result: r, from });
    else if (r.status === "affects") starts.push({ result: r, from });
    else maybe.push({ result: r, from });
  }
  return { starts, maybe, stops };
}

function milestoneSummary(m: Milestone): string {
  const on = m.changes.filter((c) => RANK[c.to] > RANK[c.from]).length;
  const off = m.changes.length - on;
  return [on && `${on} start${on === 1 ? "s" : ""}`, off && `${off} end${off === 1 ? "s" : ""}`].filter(Boolean).join(" · ");
}

export default function GrowthPlanner({
  profile,
  baseline,
  milestones,
}: {
  profile: BusinessProfile;
  baseline: ObligationsResponse;
  milestones: Milestone[];
}) {
  const current = profile.employees.inMaryland;
  const ahead = milestones.filter((m) => m.employees > current);
  const [n, setN] = useState(() => Math.min(ahead[0]?.employees ?? current, MAX));
  const [mode, setMode] = useState<"simple" | "custom">("simple");
  const [custom, setCustom] = useState<Counts>(() => scaledCounts(profile, n));
  const [whatIf, setWhatIf] = useState<ObligationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const counts = mode === "custom" ? custom : scaledCounts(profile, n);
  const validation = employeeErrors({ ...counts, coveredByFMLA: "unsure" });
  const key = `${counts.totalAllStates}/${counts.inMaryland}/${counts.fullTimeInMaryland}`;

  useEffect(() => {
    if (validation) return;
    setLoading(true);
    const t = setTimeout(() => {
      apiPost<ObligationsResponse>("/api/obligations/what-if", { employees: counts })
        .then((r) => {
          setWhatIf(r);
          setError(null);
        })
        .catch((e) => setError((e as Error).message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [key, validation]); // eslint-disable-line react-hooks/exhaustive-deps

  const changes = useMemo(() => (whatIf ? diff(baseline.results, whatIf.results) : null), [whatIf, baseline]);
  const isToday =
    counts.inMaryland === profile.employees.inMaryland &&
    counts.fullTimeInMaryland === profile.employees.fullTimeInMaryland &&
    counts.totalAllStates === profile.employees.totalAllStates;
  const visibleMilestones = milestones.filter((m) => m.employees <= MAX);
  const listed = visibleMilestones;
  // The range thumb's centre travels from THUMB/2 to (width - THUMB/2), so
  // marks must use the same geometry to line up with the handle.
  const pos = (v: number) => `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${Math.min(Math.max(v, 0), MAX) / MAX})`;
  // Only label marks that won't overlap their neighbour; all marks keep a tick.
  const labelled = new Set<number>();
  let lastLabel = -Infinity;
  for (const m of visibleMilestones) {
    if (m.employees - lastLabel >= LABEL_GAP) {
      labelled.add(m.employees);
      lastLabel = m.employees;
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Controls */}
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-slate-700">Pick a milestone</p>
          <p className="text-sm text-slate-500">Headcounts where Maryland rules change for your business.</p>
          {listed.length === 0 && (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">You're past every headcount milestone in our rules.</p>
          )}
          <ol className="mt-3 space-y-2">
            {listed.map((m) => {
              const passed = m.employees <= current;
              const selected = mode === "simple" && m.employees === n;
              return (
                <li key={m.employees}>
                  <button
                    onClick={() => {
                      setMode("simple");
                      setN(m.employees);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      selected
                        ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20"
                        : "border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/40"
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
                        passed ? "bg-emerald-100 text-emerald-700" : selected ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {passed ? <IconCheck /> : m.employees}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-900">
                        {m.employees} employee{m.employees === 1 ? "" : "s"}
                        {passed && <span className="ml-2 text-xs font-medium text-emerald-700">You're past this</span>}
                      </span>
                      <span className="block truncate text-xs text-slate-500">{m.changes.map((c) => c.title).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-slate-500">{milestoneSummary(m)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-sm font-semibold text-slate-700">Or choose any headcount</p>
          <div className="mt-3 flex items-center gap-3">
            <button
              className="grid h-11 w-11 place-items-center rounded-xl border border-slate-300 bg-white text-lg text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
              onClick={() => {
                setMode("simple");
                setN((v) => Math.max(0, v - 1));
              }}
              disabled={n <= 0}
              aria-label="One fewer employee"
            >
              <IconMinus />
            </button>
            <label className="flex-1 text-center">
              <span className="sr-only">Employees in Maryland</span>
              <input
                type="number"
                min={0}
                max={MAX}
                value={n}
                onChange={(e) => {
                  setMode("simple");
                  setN(Math.max(0, Math.min(MAX, Math.floor(Number(e.target.value) || 0))));
                }}
                className="w-full rounded-xl border border-slate-300 bg-white py-2 text-center text-3xl font-bold tracking-tight text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none"
              />
              <span className="mt-1 block text-xs text-slate-500">employees in Maryland</span>
            </label>
            <button
              className="grid h-11 w-11 place-items-center rounded-xl border border-slate-300 bg-white text-lg text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
              onClick={() => {
                setMode("simple");
                setN((v) => Math.min(MAX, v + 1));
              }}
              disabled={n >= MAX}
              aria-label="One more employee"
            >
              <IconPlus />
            </button>
          </div>

          <div className="relative mt-8 mb-8">
            <span
              className="absolute -top-6 -translate-x-1/2 rounded-full bg-emerald-100 px-1.5 text-[11px] font-semibold text-emerald-800"
              style={{ left: pos(current) }}
            >
              today
            </span>
            <input
              type="range"
              min={0}
              max={MAX}
              value={n}
              onChange={(e) => {
                setMode("simple");
                setN(Number(e.target.value));
              }}
              className="headcount-range relative z-10"
              style={{ ["--fill" as string]: pos(n) }}
              aria-label="Employees in Maryland"
            />
            {visibleMilestones.map((m) => (
              <button
                key={m.employees}
                onClick={() => {
                  setMode("simple");
                  setN(m.employees);
                }}
                className="group absolute top-3 flex -translate-x-1/2 flex-col items-center"
                style={{ left: pos(m.employees) }}
                title={`${m.employees} employees: ${m.changes.map((c) => c.title).join("; ")}`}
                aria-label={`Jump to ${m.employees} employees`}
              >
                <span className={`h-2.5 w-0.5 rounded-full ${m.employees === n ? "bg-brand-600" : "bg-amber-500"}`} />
                {labelled.has(m.employees) && (
                  <span className={`mt-0.5 text-[11px] font-semibold ${m.employees === n ? "text-brand-700" : "text-slate-500 group-hover:text-brand-700"}`}>
                    {m.employees}
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">Orange marks are milestones. Hover a mark to see what changes there.</p>

            <details
              className="mt-2 text-sm"
              open={mode === "custom"}
              onToggle={(e) => {
                if ((e.target as HTMLDetailsElement).open && mode !== "custom") {
                  setCustom(scaledCounts(profile, n));
                  setMode("custom");
                }
              }}
            >
              <summary className="cursor-pointer font-semibold text-brand-700">Set the three counts separately</summary>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(
                  [
                    ["totalAllStates", "All states"],
                    ["inMaryland", "In Maryland"],
                    ["fullTimeInMaryland", "Full-time MD"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="text-xs font-medium text-slate-600">
                    {label}
                    <input
                      type="number"
                      min={0}
                      value={custom[k]}
                      onChange={(e) => {
                        setMode("custom");
                        setCustom({ ...custom, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base font-semibold text-slate-900"
                    />
                  </label>
                ))}
              </div>
            </details>
        </div>
      </div>

      {/* Results */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xl font-bold tracking-tight text-slate-900">At {counts.inMaryland} employees</h3>
          <p className="text-sm text-slate-500">
            {counts.fullTimeInMaryland} full-time · {counts.totalAllStates} in all states
          </p>
        </div>
        {mode === "simple" && profile.employees.inMaryland > 0 && (
          <p className="mt-1 text-xs text-slate-500">Full-time count scaled from today's mix. Use "set the three counts separately" to change it.</p>
        )}

        {validation && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{validation}</p>}
        {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

        <div className={`mt-5 space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {isToday ? (
            <p className="text-slate-600">That's your size today. Pick a milestone to see what changes as you grow.</p>
          ) : !changes ? (
            <p className="text-slate-500">Working it out…</p>
          ) : changes.starts.length + changes.maybe.length + changes.stops.length === 0 ? (
            <p className="text-slate-600">Nothing changes compared with today.</p>
          ) : (
            <>
              <ChangeGroup title="New obligations" tone="red" items={changes.starts} />
              <ChangeGroup title="Might start applying" tone="amber" items={changes.maybe} />
              <ChangeGroup title="No longer applies" tone="slate" items={changes.stops} />
            </>
          )}
        </div>

        <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500">
          Each law counts employees differently. These are estimates; check each rule's source.
        </p>
      </div>
    </div>
  );
}

function ChangeGroup({ title, tone, items }: { title: string; tone: "red" | "amber" | "slate"; items: Change[] }) {
  if (!items.length) return null;
  const bar = { red: "bg-rose-500", amber: "bg-amber-500", slate: "bg-slate-300" }[tone];
  return (
    <section className="animate-fade-up">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-sm font-bold text-slate-900">{title}</h4>
        <Badge tone={tone}>{items.length}</Badge>
      </div>
      <ul className="space-y-2">
        {items.map(({ result }) => (
          <li key={result.rule.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white py-3 pr-3 pl-4">
            <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
            <p className="font-semibold text-slate-900">{result.rule.title}</p>
            <p className="mt-0.5 text-sm text-slate-600">{result.reasons.find((r) => /employee/.test(r)) ?? result.reasons[0]}</p>
            <a href={result.rule.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
              Official source <IconExternal />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
