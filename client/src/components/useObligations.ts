import { useEffect, useState } from "react";
import type { BusinessProfile, ObligationResult, ObligationsResponse } from "../../../shared/types";
import { todayIso } from "./dates";
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

export function nextDeadlineOf(results: ObligationResult[]): { date: string; label: string } | null {
  const today = todayIso();
  const all = results
    .filter((r) => r.status === "affects")
    .flatMap((r) => r.rule.deadlines ?? [])
    .filter((d) => d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  return all[0] ?? null;
}
