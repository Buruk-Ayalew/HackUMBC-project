import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ObligationCategory } from "../../../shared/types";
import FilingSchedule from "../components/FilingSchedule";
import GrowthPlanner from "../components/GrowthPlanner";
import { daysUntil, formatDate } from "../components/dates";
import { IconCalendar, IconChevron, IconClipboard, IconDownload, IconMapPin, IconTrending } from "../components/icons";
import { jurisdictionLabel } from "../components/profileOptions";
import { CATEGORY_LABELS } from "../components/schedule";
import { Card, LoadingPage, Notice, PageHeader, SectionHeading, Stat, buttonStyles } from "../components/ui";
import { nextDeadlineOf, useMilestones, useObligations } from "../components/useObligations";

export default function ObligationsPage() {
  const { data, profile, error } = useObligations();
  const { milestones } = useMilestones();
  const [category, setCategory] = useState<ObligationCategory | "all">("all");
  const [showNA, setShowNA] = useState(false);

  const applicable = useMemo(() => (data?.results ?? []).filter((r) => r.status !== "not_applicable"), [data]);
  const filtered = useMemo(() => applicable.filter((r) => category === "all" || r.rule.category === category), [applicable, category]);

  if (error) return <Notice tone="red">{error}</Notice>;
  if (!data || !profile) return <LoadingPage />;

  const affects = data.results.filter((r) => r.status === "affects").length;
  const might = data.results.filter((r) => r.status === "might").length;
  const na = data.results.filter((r) => r.status === "not_applicable");
  const next = nextDeadlineOf(data.results);
  const dueSoon = applicable.filter((r) => r.upcoming[0] && daysUntil(r.upcoming[0].date) <= 30).length;
  const categories = [...new Set(applicable.map((r) => r.rule.category))];

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <IconMapPin /> {jurisdictionLabel(profile.jurisdiction)}, Maryland
          </span>
        }
        title={profile.businessName}
        subtitle={
          <>
            Business details updated {formatDate(profile.updatedAt)} ·{" "}
            <Link to="/settings" className="font-medium text-brand-700 hover:underline">
              Edit details
            </Link>
          </>
        }
        actions={
          <>
            <a href="/api/obligations/calendar.ics" download="civicpulse-deadlines.ics" className={buttonStyles.secondary}>
              <IconDownload /> Export deadlines
            </a>
            <Link to="/calendar" className={buttonStyles.primary}>
              <IconCalendar /> Calendar
            </Link>
          </>
        }
      />

      <Card className="grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
        <Stat value={affects} label="apply to you" tone="red" />
        <Stat value={might} label="might apply" tone="amber" />
        <Stat value={dueSoon} label="due in the next 30 days" tone="brand" />
        <div>
          <p className="text-3xl font-bold tracking-tight text-slate-900">{next ? formatDate(next.date) : "—"}</p>
          <p className="truncate text-sm text-slate-500" title={next?.label}>
            {next ? `Next: ${next.label}` : "No upcoming deadline"}
          </p>
        </div>
      </Card>

      {data.coverageNotes.length > 0 && (
        <div className="space-y-2">
          {data.coverageNotes.map((n) => (
            <Notice key={n}>{n}</Notice>
          ))}
        </div>
      )}

      <section>
        <SectionHeading
          icon={<IconClipboard />}
          title="Filing schedule"
          subtitle="Every filing, payment, license renewal, and ongoing rule for your business, with where to do it. Click a row for details."
        />
        <div className="mb-4 flex flex-wrap gap-2">
          {(["all", ...categories] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                category === c ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {c === "all" ? `All (${applicable.length})` : `${CATEGORY_LABELS[c]} (${applicable.filter((r) => r.rule.category === c).length})`}
            </button>
          ))}
        </div>
        <FilingSchedule results={filtered} />
        <p className="mt-3 text-xs text-slate-500">
          Due dates that fall on a weekend or federal holiday are moved to the next business day. Dates for filings whose schedule the agency assigns
          (like withholding and sales tax) assume the most common schedule; follow any notice the agency sends you.
        </p>
      </section>

      <section className="rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-white p-5 sm:p-8">
        <SectionHeading
          icon={<IconTrending />}
          title="Growth planner: what changes when you hire?"
          subtitle={`You have ${profile.employees.inMaryland} employees in Maryland today. See which rules start at each size before you hire.`}
        />
        {milestones ? (
          <GrowthPlanner profile={profile} baseline={data} milestones={milestones} compact />
        ) : (
          <p className="text-slate-500">Loading milestones…</p>
        )}
      </section>

      <section>
        <button onClick={() => setShowNA(!showNA)} className="flex items-center gap-2 text-left" aria-expanded={showNA}>
          <IconChevron className={`text-slate-400 transition ${showNA ? "rotate-90" : ""}`} />
          <span className="text-lg font-bold text-slate-700">Doesn't apply to you ({na.length})</span>
        </button>
        {showNA && (
          <Card className="mt-3 divide-y divide-slate-100">
            {na.map((r) => (
              <div key={r.rule.id} className="animate-fade-up px-5 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-slate-800">{r.rule.title}</p>
                  <a href={r.rule.sourceUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-700 hover:underline">
                    Source
                  </a>
                </div>
                <p className="text-sm text-slate-500">{r.reasons.join(" ")}</p>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
