import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { RadarResponse } from "../../../shared/types";
import { apiGet } from "../api";
import { useAuth } from "../auth";
import { daysLabel, daysUntil, formatDate, parseDay } from "../components/dates";
import { IconArrowRight, IconCalendar, IconClipboard, IconMapPin, IconRadar, IconTrending } from "../components/icons";
import { industryLabel, jurisdictionLabel } from "../components/profileOptions";
import { allUpcoming } from "../components/schedule";
import { Badge, buttonStyles, Card, LoadingPage, Notice } from "../components/ui";
import { nextDeadlineOf, useMilestones, useObligations } from "../components/useObligations";

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

// Matches the Radar page, which lists only items that affect the business.
function radarAffectsCount(json: unknown): number | undefined {
  const results = (json as RadarResponse | undefined)?.results;
  if (!Array.isArray(results)) return undefined;
  return results.filter((r) => r.autoSorted && r.relevance === "affects").length;
}

function newCount(json: unknown): number | undefined {
  if (typeof json === "number") return json;
  const o = json as { count?: unknown; newCount?: unknown };
  const c = o?.count ?? o?.newCount;
  return typeof c === "number" ? c : undefined;
}

function ModuleCard({ to, icon, title, children, accent }: { to: string; icon: ReactNode; title: string; children: ReactNode; accent: string }) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-xl text-xl ${accent}`}>{icon}</span>
        <h2 className="font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="mt-4 flex-1">{children}</div>
      <p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
        Open <IconArrowRight className="transition group-hover:translate-x-0.5" />
      </p>
    </Link>
  );
}

function Unavailable({ state }: { state: "loading" | "unavailable" }) {
  return <p className="text-slate-500">{state === "loading" ? "Loading…" : "Not available yet"}</p>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, profile, error } = useObligations();
  const { milestones } = useMilestones();
  const radar = useOptional("/api/radar", radarAffectsCount);
  const risk = useOptional("/api/local-risk/new-count", newCount);

  if (error) return <Notice tone="red">{error}</Notice>;
  if (!data || !profile) return <LoadingPage />;

  const affects = data.results.filter((r) => r.status === "affects").length;
  const might = data.results.filter((r) => r.status === "might").length;
  const next = nextDeadlineOf(data.results);
  const upcoming = allUpcoming(data.results).slice(0, 5);
  const nextMilestone = milestones?.find((m) => m.employees > profile.employees.inMaryland);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="text-sm text-slate-500">A one-page summary to share with your CPA, lawyer, or partner.</p>
        <Link to="/briefing?print=1" className={buttonStyles.secondary}>
          Download Monthly Executive Briefing
        </Link>
      </div>
      <section className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-8 text-white sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-600/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-slate-300">
              {greeting}
              {user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{profile.businessName}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <IconMapPin /> {jurisdictionLabel(profile.jurisdiction)}, MD
              </span>
              <span>·</span>
              <span>{industryLabel(profile.industry)}</span>
              <span>·</span>
              <span>{profile.employees.inMaryland} employees</span>
            </p>
          </div>
          {next && (
            <div className="rounded-2xl bg-white/10 px-5 py-4 ring-1 ring-white/15 backdrop-blur">
              <p className="text-xs font-semibold tracking-wide text-slate-300 uppercase">Next deadline</p>
              <p className="mt-1 text-2xl font-bold">{formatDate(next.date)}</p>
              <p className="max-w-64 truncate text-sm text-slate-300" title={next.label}>
                {next.label}
              </p>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ModuleCard to="/obligations" icon={<IconClipboard />} title="Obligations" accent="bg-rose-50 text-rose-600">
          <p className="text-4xl font-bold tracking-tight text-slate-900">{affects}</p>
          <p className="text-slate-600">
            apply to you · <span className="text-amber-700">{might} might</span>
          </p>
        </ModuleCard>
        <ModuleCard to="/radar" icon={<IconRadar />} title="Regulatory Radar" accent="bg-brand-50 text-brand-600">
          {radar.state === "ready" ? (
            <>
              <p className="text-4xl font-bold tracking-tight text-slate-900">{radar.value}</p>
              <p className="text-slate-600">{radar.value === 1 ? "change affects" : "changes affect"} you</p>
            </>
          ) : (
            <Unavailable state={radar.state} />
          )}
        </ModuleCard>
        <ModuleCard to="/local-risk" icon={<IconMapPin />} title="Local Risk" accent="bg-sky-50 text-sky-600">
          {risk.state === "ready" ? (
            <>
              <p className="text-4xl font-bold tracking-tight text-slate-900">{risk.value}</p>
              <p className="text-slate-600">new nearby projects</p>
            </>
          ) : (
            <Unavailable state={risk.state} />
          )}
        </ModuleCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <IconCalendar className="text-brand-600" /> Coming up
            </h2>
            <Link to="/obligations" className="text-sm font-semibold text-brand-700 hover:underline">
              All obligations
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-slate-500">No upcoming deadlines.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((u) => {
                const d = parseDay(u.date);
                const soon = daysUntil(u.date) <= 14;
                return (
                  <li key={u.date + u.label} className="flex items-center gap-4 py-3">
                    <div className={`w-14 shrink-0 rounded-xl py-1.5 text-center ${soon ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
                      <p className="text-[11px] font-semibold uppercase">{d.toLocaleDateString("en-US", { month: "short" })}</p>
                      <p className="text-lg leading-tight font-bold">{d.getDate()}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{u.label}</p>
                      <p className="text-sm text-slate-500">
                        {u.result.rule.agency} · {daysLabel(u.date)}
                      </p>
                    </div>
                    {u.result.status === "might" && <Badge tone="amber">Might apply</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Link
          to="/growth"
          className="group flex flex-col rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-6 shadow-card transition hover:shadow-lift"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-xl text-white">
            <IconTrending />
          </span>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Planning to hire?</h2>
          {nextMilestone ? (
            <p className="mt-1 text-slate-600">
              At <strong className="text-slate-900">{nextMilestone.employees} employees</strong>, {nextMilestone.changes.length} rule
              {nextMilestone.changes.length === 1 ? "" : "s"} change for you, including: <strong className="text-slate-900">{nextMilestone.changes[0]?.title}</strong>
            </p>
          ) : (
            <p className="mt-1 text-slate-600">See which Maryland rules start as your team grows.</p>
          )}
          <p className="mt-auto pt-4 text-sm font-semibold text-brand-700">
            Open the Growth Planner <IconArrowRight className="inline transition group-hover:translate-x-0.5" />
          </p>
        </Link>
      </div>

      <p className="text-sm text-slate-500">
        Details changed?{" "}
        <Link to="/settings" className="font-semibold text-brand-700 hover:underline">
          Update your business details
        </Link>
      </p>
    </div>
  );
}
