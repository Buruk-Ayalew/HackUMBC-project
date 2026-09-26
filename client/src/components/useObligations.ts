import { useCallback, useEffect, useState } from "react";
import type { BusinessProfile, DueDate, Milestone, ObligationResult, ObligationsResponse } from "../../../shared/types";
import { apiGet, apiPost } from "../api";

export function useObligations() {
  const [data, setData] = useState<ObligationsResponse | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    Promise.all([apiGet<ObligationsResponse>("/api/obligations"), apiGet<BusinessProfile>("/api/profile")])
      .then(([o, p]) => {
        setData(o);
        setProfile(p);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  // A live check started on the server: load the fresh results once it's done.
  const stillRefreshing = data?.refreshing ?? false;
  useEffect(() => {
    if (!stillRefreshing) return;
    const t = setTimeout(() => {
      apiGet<ObligationsResponse>("/api/obligations").then(setData).catch(() => {});
    }, 8000);
    return () => clearTimeout(t);
  }, [stillRefreshing, data]);

  // "Check now": re-read every official page.
  const checkNow = useCallback(async () => {
    setChecking(true);
    try {
      setData(await apiPost<ObligationsResponse>("/api/obligations/refresh"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }, []);

  return { data, profile, error, checking, checkNow };
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
