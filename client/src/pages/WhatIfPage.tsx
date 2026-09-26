import GrowthPlanner from "../components/GrowthPlanner";
import { IconTrending } from "../components/icons";
import { Card, LoadingPage, Notice, PageHeader } from "../components/ui";
import { useMilestones, useObligations } from "../components/useObligations";

export default function WhatIfPage() {
  const { data: baseline, profile, error } = useObligations();
  const { milestones, error: mError } = useMilestones();

  if (error || mError) return <Notice tone="red">{error ?? mError}</Notice>;
  if (!baseline || !profile || !milestones) return <LoadingPage />;

  const e = profile.employees;
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <IconTrending /> Growth Planner
          </span>
        }
        title="What changes when you hire?"
        subtitle="Maryland rules switch on at different headcounts. Pick a milestone to see exactly what starts, what might start, and what stops."
      />

      <Card className="grid grid-cols-3 divide-x divide-slate-100 p-0">
        {[
          [e.inMaryland, "employees in Maryland today"],
          [e.fullTimeInMaryland, "full-time"],
          [e.totalAllStates, "in all states"],
        ].map(([v, l]) => (
          <div key={String(l)} className="p-5 text-center">
            <p className="text-2xl font-bold text-slate-900">{v}</p>
            <p className="text-xs text-slate-500 sm:text-sm">{l}</p>
          </div>
        ))}
      </Card>

      <GrowthPlanner profile={profile} baseline={baseline} milestones={milestones} />
    </div>
  );
}
