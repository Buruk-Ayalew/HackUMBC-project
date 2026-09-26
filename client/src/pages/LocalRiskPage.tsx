import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImpactTag, LocalContextResponse, LocalRiskResponse, RiskLevel } from "../../../shared/types";
import { apiGet, ApiError } from "../api";
import LocationContext from "../components/localRisk/LocationContext";
import RiskMap from "../components/localRisk/RiskMap";
import RiskItemCard from "../components/localRisk/RiskItemCard";
import {
  formatDate,
  IMPACT_CHIP,
  IMPACT_LABEL,
  IMPACT_ORDER,
  LEVEL_BADGE,
  LEVEL_LABEL,
  RADIUS_OPTIONS,
} from "../components/localRisk/format";

const PAGE_SIZE = 50;
const LEVELS: RiskLevel[] = ["high", "medium", "low"];

// Owner: Person 3 (Local Risk).
export default function LocalRiskPage() {
  const [radius, setRadius] = useState<number>(805);
  const [data, setData] = useState<LocalRiskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [levels, setLevels] = useState<Set<RiskLevel>>(new Set(["high", "medium"]));
  const [impactFilter, setImpactFilter] = useState<Set<ImpactTag>>(new Set()); // empty = all impacts
  const [newOnly, setNewOnly] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLLIElement>());

  const load = useCallback(async (r: number, refresh: boolean) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(await apiGet<LocalRiskResponse>(`/api/local-risk?radius=${r}${refresh ? "&refresh=1" : ""}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load Local Risk. Try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Zoning, flood zone, and competitors load separately so a slow source
  // (OpenStreetMap can take several seconds) never holds up the risk list.
  const [context, setContext] = useState<LocalContextResponse | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [showCompetitors, setShowCompetitors] = useState(true);

  const loadContext = useCallback(async (r: number, refresh: boolean) => {
    setContextLoading(true);
    setContextError(null);
    try {
      setContext(await apiGet<LocalContextResponse>(`/api/local-risk/context?radius=${r}${refresh ? "&refresh=1" : ""}`));
    } catch (err) {
      setContextError(err instanceof ApiError ? err.message : "Couldn't load zoning, flood, and competitor info.");
    } finally {
      setContextLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(radius, false);
    void loadContext(radius, false);
  }, [load, loadContext, radius]);

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0, new: 0 };
    for (const i of data?.items ?? []) {
      c[i.riskLevel]++;
      if (i.isNew) c.new++;
    }
    return c;
  }, [data]);

  // Impact tags present in the results, with counts, in a fixed order.
  const impactCounts = useMemo(() => {
    const c = new Map<ImpactTag, number>();
    for (const i of data?.items ?? []) for (const t of i.impacts) c.set(t, (c.get(t) ?? 0) + 1);
    return IMPACT_ORDER.filter((t) => c.has(t)).map((t) => ({ tag: t, count: c.get(t)! }));
  }, [data]);

  const filtered = useMemo(
    () =>
      (data?.items ?? []).filter(
        (i) =>
          levels.has(i.riskLevel) &&
          (impactFilter.size === 0 || i.impacts.some((t) => impactFilter.has(t))) &&
          (!newOnly || i.isNew),
      ),
    [data, levels, impactFilter, newOnly],
  );

  useEffect(() => setShown(PAGE_SIZE), [levels, impactFilter, newOnly, radius]);

  function toggleImpact(t: ImpactTag) {
    setImpactFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function toggleLevel(l: RiskLevel) {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });
  }

  // Selecting from the map scrolls the list; selecting from the list pans the map.
  function selectFromMap(id: string) {
    const index = filtered.findIndex((i) => i.id === id);
    if (index >= shown) setShown(index + 1);
    setSelectedId(id);
    requestAnimationFrame(() => cardRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  const radiusLabel = RADIUS_OPTIONS.find((o) => o.meters === radius)?.label ?? "";
  const cachedSources = data?.sources.filter((s) => s.status === "cached") ?? [];
  const downSources = data?.sources.filter((s) => s.status === "unavailable") ?? [];
  const lastChecked = data?.sources.map((s) => s.fetchedAt).filter((x): x is string => !!x).sort()[0];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Local Risk</h1>
          <p className="mt-1 text-slate-600">
            What's around <span className="font-medium text-slate-800">{data?.center.address ?? "your business"}</span>: zoning,
            flood risk, competitors, and nearby construction and road work.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Search radius" className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
            {RADIUS_OPTIONS.map((o) => (
              <button
                key={o.meters}
                role="radio"
                aria-checked={radius === o.meters}
                onClick={() => setRadius(o.meters)}
                className={`rounded-md px-3 py-1.5 ${radius === o.meters ? "bg-blue-700 font-semibold text-white" : "text-slate-700 hover:bg-slate-100"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              void load(radius, true);
              void loadContext(radius, true);
            }}
            disabled={refreshing || loading}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {refreshing ? "Checking…" : "Check now"}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {loading && !data && <p className="mt-6 text-slate-500">Checking nearby projects…</p>}

      {data && (
        <>
          <div className="mt-4 space-y-2 text-sm">
            {data.coverage === "limited" && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">{data.coverageNote}</p>
            )}
            {cachedSources.map((s) => (
              <p key={s.source} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">
                <span className="font-medium">{s.name}:</span> Showing saved results from {formatDate(s.fetchedAt)}.
              </p>
            ))}
            {downSources.map((s) => (
              <p key={s.source} className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
                <span className="font-medium">{s.name}</span> is unavailable right now, so it isn't included.
              </p>
            ))}
          </div>

          <section className="mt-6">
            <h2 className="mb-3 text-lg font-bold tracking-tight text-slate-900">Your location</h2>
            <LocationContext
              context={context}
              loading={contextLoading}
              error={contextError}
              radiusLabel={radiusLabel}
              showCompetitorsOnMap={showCompetitors}
              onToggleCompetitorsOnMap={setShowCompetitors}
            />
          </section>

          <h2 className="mt-8 text-lg font-bold tracking-tight text-slate-900">Construction and projects nearby</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => toggleLevel(l)}
                aria-pressed={levels.has(l)}
                className={`rounded-full px-3 py-1 font-medium ring-1 ${
                  levels.has(l) ? LEVEL_BADGE[l] : "bg-white text-slate-400 ring-slate-200 line-through"
                }`}
              >
                {LEVEL_LABEL[l]} ({counts[l]})
              </button>
            ))}
            <label className="ml-1 inline-flex items-center gap-1.5 text-slate-700">
              <input type="checkbox" checked={newOnly} onChange={(e) => setNewOnly(e.target.checked)} />
              New only ({counts.new})
            </label>
          </div>
          {impactCounts.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Filter by impact">
              <span className="text-slate-500">Impact:</span>
              {impactCounts.map(({ tag, count }) => {
                const on = impactFilter.has(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleImpact(tag)}
                    aria-pressed={on}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
                      on ? IMPACT_CHIP[tag] : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {IMPACT_LABEL[tag]} ({count})
                  </button>
                );
              })}
              {impactFilter.size > 0 && (
                <button onClick={() => setImpactFilter(new Set())} className="text-xs font-medium text-brand-700 hover:underline">
                  Clear
                </button>
              )}
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="h-72 overflow-hidden rounded-lg border border-slate-200 sm:h-96 lg:sticky lg:top-4 lg:h-[640px]">
              <RiskMap
                center={data.center}
                radiusMeters={data.radiusMeters}
                items={filtered}
                selectedId={selectedId}
                onSelect={selectFromMap}
                competitors={showCompetitors ? context?.competitors.items : undefined}
              />
            </div>

            <div>
              <p className="mb-2 text-sm text-slate-500">
                Showing {Math.min(shown, filtered.length)} of {filtered.length} matching item{filtered.length === 1 ? "" : "s"} within{" "}
                {radiusLabel} ({data.items.length} total).
              </p>
              {filtered.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                  {data.items.length === 0 ? (
                    <>
                      <p className="font-medium text-slate-800">No active projects found within {radiusLabel}.</p>
                      <p className="mt-1">
                        That covers only the sources listed below. It doesn't mean there's no work nearby. Try a larger radius.
                      </p>
                    </>
                  ) : (
                    <p>No items match these filters. {counts.low > 0 && !levels.has("low") && "Try turning on Low."}</p>
                  )}
                </div>
              ) : (
                <ul className="space-y-3">
                  {filtered.slice(0, shown).map((item) => (
                    <RiskItemCard
                      key={item.id}
                      item={item}
                      selected={item.id === selectedId}
                      onSelect={() => setSelectedId(item.id)}
                      ref={(el) => {
                        if (el) cardRefs.current.set(item.id, el);
                        else cardRefs.current.delete(item.id);
                      }}
                    />
                  ))}
                </ul>
              )}
              {shown < filtered.length && (
                <button
                  onClick={() => setShown((n) => n + PAGE_SIZE)}
                  className="mt-3 w-full rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Show {Math.min(PAGE_SIZE, filtered.length - shown)} more
                </button>
              )}
            </div>
          </div>

          <details className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <summary className="cursor-pointer font-medium text-slate-900">How risk levels work</summary>
            <p className="mt-2">
              Levels are rule-based estimates from three things only: distance, type of project, and timing. They don't
              predict foot traffic or sales.
            </p>
            <p className="mt-2">
              Impact tags (like "Access & parking") say what kind of effect something could have, and the level says how
              close and current it is. Tap ⓘ on any tag for a short explanation.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <span className="font-medium">High:</span> road closures, road work, demolition, new construction, or site
                work that's happening now or within 30 days, about 500 ft away or closer. Also full road closures and
                active state road construction within about ¼ mile.
              </li>
              <li>
                <span className="font-medium">Medium:</span> other major work within about ½ mile, commercial work of
                $100,000+ within about 500 ft, or commercial work of $1 million+ within about ¼ mile (costs as reported on
                the permit).
              </li>
              <li>
                <span className="font-medium">Low:</span> everything else, including small residential jobs and projects
                that are on hold or still in design.
              </li>
              <li>
                <span className="font-medium">Development plans</span> (Baltimore County) are future work with no published
                schedule, so they're never High: Medium within about ¼ mile of your address (or if you're inside the plan
                area), otherwise Low.
              </li>
            </ul>
            <p className="mt-2">Distances are straight-line. State road projects are mapped at one reference point, and the work may run along the road.</p>
          </details>

          <div className="mt-4 text-xs text-slate-500">
            <p>
              Sources checked:{" "}
              {data.sources.map((s, i) => (
                <span key={s.source}>
                  {i > 0 && ", "}
                  {s.name} ({s.status === "unavailable" ? "unavailable" : `${s.itemCount} within ${radiusLabel}`})
                </span>
              ))}
              .
            </p>
            {data.coverage === "full" && <p className="mt-1">{data.coverageNote}</p>}
            {lastChecked && <p className="mt-1">Oldest data checked {formatDate(lastChecked)}. Data refreshes every 12 hours.</p>}
          </div>
        </>
      )}
    </div>
  );
}
