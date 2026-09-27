// Regulatory Radar. Owner: Person 2.
import { useEffect, useMemo, useState } from "react";
import type { RadarResponse, RadarResult, Relevance } from "../../../shared/types";
import { apiGet, apiPost } from "../api";
import RadarCard from "../components/radar/RadarCard";
import HaveYourSay from "../components/radar/HaveYourSay";
import { formatDate, formatDateTime, keyDate } from "../components/radar/format";

type SourceFilter = "all" | "md_register" | "bill" | "agency_news";

const SECTIONS: { relevance: Relevance; title: string; heading: string }[] = [
  { relevance: "affects", title: "Affects you", heading: "text-red-700" },
  { relevance: "not_applicable", title: "Doesn't apply", heading: "text-slate-500" },
];
const PAGE = 15;

function Section({ title, heading, results, collapsed }: { title: string; heading: string; results: RadarResult[]; collapsed?: boolean }) {
  const [shown, setShown] = useState(PAGE);
  const body = (
    <div className="mt-3 space-y-3">
      {results.slice(0, shown).map((r) => (
        <RadarCard key={r.item.id} result={r} />
      ))}
      {results.length > shown && (
        <button onClick={() => setShown((n) => n + PAGE)} className="text-sm font-medium text-blue-700 hover:underline">
          Show {Math.min(PAGE, results.length - shown)} more of {results.length - shown} remaining
        </button>
      )}
    </div>
  );
  if (collapsed) {
    return (
      <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <summary className={`cursor-pointer text-lg font-semibold ${heading}`}>
          {title} ({results.length})
        </summary>
        {body}
      </details>
    );
  }
  return (
    <section>
      <h2 className={`text-lg font-semibold ${heading}`}>
        {title} ({results.length})
      </h2>
      {results.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nothing here right now.</p> : body}
    </section>
  );
}

export default function RadarPage() {
  const [data, setData] = useState<RadarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState<SourceFilter>("all");
  const [deadlineOnly, setDeadlineOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    apiGet<RadarResponse>("/api/radar")
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Sorting runs in the background on the server; poll until it's done.
  const sorting = data?.sortingInProgress ?? false;
  useEffect(() => {
    if (!sorting || refreshing) return;
    const t = setTimeout(() => {
      apiGet<RadarResponse>("/api/radar").then(setData).catch(() => {});
    }, 20000);
    return () => clearTimeout(t);
  }, [sorting, data, refreshing]);

  async function checkNow() {
    setRefreshing(true);
    setError(null);
    try {
      setData(await apiPost<RadarResponse>("/api/radar/refresh"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.results.filter(({ item }) => {
      if (source === "bill" && item.kind !== "bill") return false;
      if (source !== "all" && source !== "bill" && item.source !== source) return false;
      if (deadlineOnly && !item.commentDeadline && !item.hearingDate) return false;
      if (from || to) {
        const d = keyDate(item);
        if (!d) return false;
        if (from && d.slice(0, 10) < from) return false;
        if (to && d.slice(0, 10) > to) return false;
      }
      return true;
    });
  }, [data, source, deadlineOnly, from, to]);

  const bySection = (r: Relevance) => filtered.filter((x) => x.relevance === r);
  const unsortedCount = data?.results.filter((r) => !r.autoSorted).length ?? 0;
  // Only clear matches and non-matches are listed; uncertain ("might") items are left out.
  const nothingRelevant = data && !data.results.some((r) => r.relevance === "affects");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Regulatory Radar</h1>
          <p className="text-sm text-slate-500">
            New and upcoming Maryland law and regulation changes, sorted for your business.
            {data && <> Last checked: {formatDateTime(data.lastChecked)}.</>}
          </p>
        </div>
        <button
          onClick={checkNow}
          disabled={refreshing || loading}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {refreshing ? "Checking sources…" : "Check now"}
        </button>
      </header>

      {loading && <p className="text-slate-500">Checking for changes that affect your business… The first check can take a minute.</p>}
      {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {data && (data.usingCachedData || data.unavailableSources.length > 0) && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {data.usingCachedData && data.savedResultsFrom && (
            <p className="font-medium">Showing saved results from {formatDateTime(data.savedResultsFrom)}.</p>
          )}
          {data.unavailableSources.length > 0 && (
            <>
              <p className={data.usingCachedData ? "mt-1" : "font-medium"}>Some sources couldn't be checked:</p>
              <ul className="ml-5 list-disc">
                {data.unavailableSources.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {data && sorting && (
        <p className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Sorting {unsortedCount} item{unsortedCount === 1 ? "" : "s"} for your business… They'll appear here if they affect you. This page updates by itself.
        </p>
      )}
      {data && !sorting && unsortedCount > 0 && (
        <p className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Automatic sorting isn't available for {unsortedCount} item{unsortedCount === 1 ? "" : "s"} right now, so they aren't shown. Click "Check now" later to try
          again.
        </p>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">Source</span>
                <select value={source} onChange={(e) => setSource(e.target.value as SourceFilter)} className="rounded border border-slate-300 px-2 py-1">
                  <option value="all">All sources</option>
                  <option value="md_register">Maryland Register</option>
                  <option value="bill">Bills and new laws</option>
                  <option value="agency_news">Agency news</option>
                </select>
              </label>
              <label className="flex items-center gap-2 pb-1">
                <input type="checkbox" checked={deadlineOnly} onChange={(e) => setDeadlineOnly(e.target.checked)} />
                Has a comment deadline or hearing
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">From</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">To</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
              </label>
              {(source !== "all" || deadlineOnly || from || to) && (
                <button
                  onClick={() => {
                    setSource("all");
                    setDeadlineOnly(false);
                    setFrom("");
                    setTo("");
                  }}
                  className="pb-1 text-blue-700 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>

            {nothingRelevant && (
              <p className="rounded-lg border border-slate-200 bg-white p-4 text-slate-600">
                No new changes found for your business since {formatDate(data.lastChecked)}.
              </p>
            )}
            {SECTIONS.filter((s) => !nothingRelevant || s.relevance === "not_applicable").map((s) => (
                <Section
                  key={`${s.relevance}-${source}-${deadlineOnly}-${from}-${to}`}
                  title={s.title}
                  heading={s.heading}
                  results={bySection(s.relevance)}
                  collapsed={s.relevance === "not_applicable"}
                />
            ))}
          </div>
          <aside className="order-first lg:order-none">
            <HaveYourSay results={data.results} />
          </aside>
        </div>
      )}
    </div>
  );
}
