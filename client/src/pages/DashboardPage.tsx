import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { useAuth } from "../auth";
import { formatDate } from "../components/dates";
import { jurisdictionLabel } from "../components/profileOptions";
import { nextDeadlineOf, useObligations } from "../components/useObligations";

type Loadable<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "unavailable" };

// Radar and Local Risk belong to other modules and may not be ready yet, so
// read their responses defensively.
function useOptional<T>(path: string, pick: (json: unknown) => T | undefined): Loadable<T> {
  const [v, setV] = useState<Loadable<T>>({ state: "loading" });
  useEffect(() => {
    apiGet<unknown>(path)
      .then((json) => {
        const value = pick(json);
        setV(value === undefined ? { state: "unavailable" } : { state: "ready", value });
      })
      .catch(() => setV({ state: "unavailable" }));
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

function radarAffectsCount(json: unknown): number | undefined {
  const items = Array.isArray(json) ? json : (json as { items?: unknown })?.items;
  if (!Array.isArray(items)) return undefined;
  return items.filter((i) => (i as { relevance?: string; status?: string })?.relevance === "affects" || (i as { status?: string })?.status === "affects").length;
}

function newCount(json: unknown): number | undefined {
  if (typeof json === "number") return json;
  const c = (json as { count?: unknown; newCount?: unknown })?.count ?? (json as { newCount?: unknown })?.newCount;
  return typeof c === "number" ? c : undefined;
}

function Card({ to, title, children }: { to: string; title: string; children: ReactNode }) {
  return (
    <Link to={to} className="block rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-400 hover:shadow">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>
      <div className="mt-2">{children}</div>
      <p className="mt-4 text-sm font-medium text-blue-700">Open {title} →</p>
    </Link>
  );
}

function Unavailable({ state }: { state: "loading" | "unavailable" }) {
  return <p className="text-slate-500">{state === "loading" ? "Loading…" : "Not available yet"}</p>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, profile, error } = useObligations();
  const radar = useOptional("/api/radar", radarAffectsCount);
  const risk = useOptional("/api/local-risk/new-count", newCount);

  const affects = data?.results.filter((r) => r.status === "affects").length ?? 0;
  const might = data?.results.filter((r) => r.status === "might").length ?? 0;
  const next = data ? nextDeadlineOf(data.results) : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Hello{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
        {profile && (
          <p className="text-slate-600">
            {profile.businessName} · {jurisdictionLabel(profile.jurisdiction)}, Maryland
          </p>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card to="/obligations" title="Obligations">
          {error ? (
            <p className="text-red-700">{error}</p>
          ) : !data ? (
            <Unavailable state="loading" />
          ) : (
            <>
              <p className="text-3xl font-bold text-red-700">{affects}</p>
              <p className="text-slate-700">affect you · {might} might</p>
              {next && (
                <p className="mt-2 text-sm text-slate-600">
                  Next deadline: <strong>{formatDate(next.date)}</strong>
                  <br />
                  {next.label}
                </p>
              )}
            </>
          )}
        </Card>

        <Card to="/radar" title="Regulatory Radar">
          {radar.state === "ready" ? (
            <>
              <p className="text-3xl font-bold text-red-700">{radar.value}</p>
              <p className="text-slate-700">changes affect you</p>
            </>
          ) : (
            <Unavailable state={radar.state} />
          )}
        </Card>

        <Card to="/local-risk" title="Local Risk">
          {risk.state === "ready" ? (
            <>
              <p className="text-3xl font-bold text-blue-800">{risk.value}</p>
              <p className="text-slate-700">new nearby projects</p>
            </>
          ) : (
            <Unavailable state={risk.state} />
          )}
        </Card>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link to="/settings" className="text-blue-700 underline">
          Update your business details
        </Link>
        <Link to="/calendar" className="text-blue-700 underline">
          See all deadlines on the calendar
        </Link>
      </div>
    </div>
  );
}
