import { useState } from "react";
import GrowthPlanner from "../components/GrowthPlanner";
import { IconMapPin, IconTrending, IconUsers } from "../components/icons";
import LocationPlanner from "../components/LocationPlanner";
import { Card, LoadingPage, Notice, PageHeader } from "../components/ui";
import { useMilestones, useObligations } from "../components/useObligations";

export default function WhatIfPage() {
  const { data: baseline, profile, error } = useObligations();
  const { milestones, error: mError } = useMilestones();
  const [tab, setTab] = useState<"hire" | "location">("hire");

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
        title="What changes as you grow?"
        subtitle="Maryland rules change as you hire and as you open new locations. See what starts, what might start, and what stops."
      />

      <div role="tablist" className="inline-flex rounded-xl bg-slate-100 p-1">
        {(
          [
            ["hire", <IconUsers key="u" />, "Hire more people"],
            ["location", <IconMapPin key="m" />, "Open another location"],
          ] as const
        ).map(([id, icon, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === id ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

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

      {tab === "hire" ? (
        <GrowthPlanner profile={profile} baseline={baseline} milestones={milestones} />
      ) : (
        <LocationPlanner profile={profile} baseline={baseline} />
      )}
    </div>
  );
}
