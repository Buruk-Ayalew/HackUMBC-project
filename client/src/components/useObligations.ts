import { useEffect, useState } from "react";
import type { BusinessProfile, DueDate, Milestone, ObligationResult, ObligationsResponse } from "../../../shared/types";
import { apiGet } from "../api";

export function useObligations() {
  const [data, setData] = useState<ObligationsResponse | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiGet<ObligationsResponse>("/api/obligations"), apiGet<BusinessProfile>("/api/profile")])
      .then(([o, p]) => {
        setData(o);
        setProfile(p);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  return { data, profile, error };
}

export function useMilestones() {
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<Milestone[]>("/api/obligations/milestones")
      .then(setMilestones)
      .catch((e) => setError((e as Error).message));
  }, []);
  return { milestones, error };
}

// Soonest due date among obligations that affect the business.
export function nextDeadlineOf(results: ObligationResult[]): DueDate | null {
  return (
    results
      .filter((r) => r.status === "affects")
      .flatMap((r) => r.upcoming)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  );
}
