// One-page "Monthly Executive Briefing": obligations, regulatory changes, and
// nearby risk on a single printable page, for an owner to hand to their CPA,
// lawyer, or business partner. Saved as a PDF through the browser's print dialog.
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { LocalRiskResponse, RadarResponse, RiskItem } from "../../../shared/types";
import { apiGet } from "../api";
import { daysUntil, formatDate, todayIso } from "../components/dates";
import { IconLogo } from "../components/icons";
import { CATEGORY_LABEL } from "../components/localRisk/format";
import { industryLabel, jurisdictionLabel } from "../components/profileOptions";
import { allUpcoming } from "../components/schedule";
import { buttonStyles, LoadingPage, Notice } from "../components/ui";
import { useObligations } from "../components/useObligations";

const DEADLINE_DAYS = 45;
const LIMITS = { deadlines: 8, confirm: 4, radar: 5, risk: 5 };

type Loaded<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "unavailable" };

function useLoad<T>(path: string): Loaded<T> {
  const [v, setV] = useState<Loaded<T>>({ state: "loading" });
  useEffect(() => {
    apiGet<T>(path)
      .then((value) => setV({ state: "ready", value }))
      .catch(() => setV({ state: "unavailable" }));
  }, [path]);
  return v;
}

const miles = (m: number) => {
  const mi = m / 1609.34;
  return mi < 0.1 ? `${Math.round(m * 3.281)} ft` : `${mi.toFixed(1)} mi`;
};

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-1.5 flex items-baseline gap-2 border-b border-slate-300 pb-1 text-[13px] font-bold tracking-wide text-slate-900 uppercase">
        {title}
        {count !== undefined && <span className="text-[11px] font-semibold text-slate-500 normal-case">({count})</span>}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-slate-500 italic">{children}</p>;
}

export default function BriefingPage() {
  const { data, profile, error } = useObligations();
  const radar = useLoad<RadarResponse>("/api/radar");
  const risk = useLoad<LocalRiskResponse>("/api/local-risk");
  const [params] = useSearchParams();
  const printed = useRef(false);

  const ready = !!data && !!profile && radar.state !== "loading" && risk.state !== "loading";

  // Opened from the dashboard button (?print=1): bring up the print / save-as-PDF dialog once everything has loaded.
  useEffect(() => {
    if (ready && params.get("print") === "1" && !printed.current) {
      printed.current = true;
      setTimeout(() => window.print(), 300);
    }
  }, [ready, params]);

  if (error) return <Notice tone="red">{error}</Notice>;
  if (!ready || !data || !profile) return <LoadingPage />;

  const today = todayIso();
  const month = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const deadlines = allUpcoming(data.results).filter((u) => u.date >= today && daysUntil(u.date) <= DEADLINE_DAYS);
  const applies = data.results.filter((r) => r.status === "affects");
  const toConfirm = data.results.filter((r) => r.status === "might");

  const radarItems =
    radar.state === "ready" ? radar.value.results.filter((r) => r.autoSorted && r.relevance === "affects") : [];
  const riskItems: RiskItem[] =
    risk.state === "ready" ? risk.value.items.filter((i) => i.riskLevel === "high" || i.riskLevel === "medium") : [];
  const highRisk = riskItems.filter((i) => i.riskLevel === "high").length;

  const glance: [number | string, string][] = [
    [applies.length, "obligations apply"],
    [deadlines.length, `deadlines in ${DEADLINE_DAYS} days`],
    [radar.state === "ready" ? radarItems.length : "—", "law & rule changes affect you"],
    [risk.state === "ready" ? highRisk : "—", "high-risk projects nearby"],
  ];

  return (
    <div className="briefing">
      {/* Toolbar: on screen only */}
      <div className="mx-auto mb-4 flex max-w-[8.5in] flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/dashboard" className="text-sm font-semibold text-brand-700 hover:underline">
          ← Back to dashboard
        </Link>
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-500">In the print dialog, choose "Save as PDF" to download.</p>
          <button onClick={() => window.print()} className={buttonStyles.primary}>
            Print or save as PDF
          </button>
        </div>
      </div>

      {/* The page itself: sized like a letter sheet on screen, full page when printed */}
      <article className="mx-auto max-w-[8.5in] space-y-4 rounded-lg bg-white p-[0.5in] text-slate-800 shadow-card ring-1 ring-slate-200 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0">
        <header className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-brand-700 uppercase">Monthly Executive Briefing · {month}</p>
            <h1 className="mt-0.5 text-2xl font-bold text-slate-900">{profile.businessName}</h1>
            <p className="text-[12px] text-slate-600">
              {profile.address} · {jurisdictionLabel(profile.jurisdiction)}, MD · {industryLabel(profile.industry)} ·{" "}
              {profile.employees.inMaryland} employees in Maryland
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="flex items-center justify-end gap-1.5 text-base font-bold text-slate-900">
              <IconLogo className="text-xl text-brand-600" /> RegWise
            </p>
            <p className="text-[11px] text-slate-500">Prepared {formatDate(today)}</p>
          </div>
        </header>

        <div className="grid grid-cols-4 gap-2">
          {glance.map(([n, label]) => (
            <div key={label} className="rounded-md border border-slate-200 px-2.5 py-1.5">
              <p className="text-xl leading-tight font-bold text-slate-900">{n}</p>
              <p className="text-[10.5px] leading-tight text-slate-600">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Section title={`Deadlines, next ${DEADLINE_DAYS} days`} count={deadlines.length}>
            {deadlines.length === 0 ? (
              <Empty>No deadlines in the next {DEADLINE_DAYS} days.</Empty>
            ) : (
              <table className="w-full text-[11px]">
                <tbody>
                  {deadlines.slice(0, LIMITS.deadlines).map((u) => (
                    <tr key={u.date + u.label} className="border-b border-slate-100 align-top last:border-0">
                      <td className="w-16 py-1 pr-2 font-semibold whitespace-nowrap text-slate-900">{formatDate(u.date).replace(/, \d{4}$/, "")}</td>
                      <td className="py-1">
                        {u.label}
                        {u.result.rule.agency && <span className="text-slate-500"> · {u.result.rule.agency}</span>}
                        {u.result.status === "might" && <span className="font-semibold text-amber-700"> · might apply</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {deadlines.length > LIMITS.deadlines && <Empty>+{deadlines.length - LIMITS.deadlines} more in RegWise.</Empty>}
          </Section>

          <Section title="To confirm with your advisor" count={toConfirm.length}>
            <p className="mb-1 text-[10.5px] text-slate-500">These might apply; the answer depends on details we can't check.</p>
            {toConfirm.length === 0 ? (
              <Empty>Nothing to confirm right now.</Empty>
            ) : (
              <ul className="space-y-1 text-[11px]">
                {toConfirm.slice(0, LIMITS.confirm).map((r) => (
                  <li key={r.rule.id}>
                    <span className="font-semibold text-slate-900">{r.rule.title}.</span>{" "}
                    <span className="text-slate-600">{r.reasons[0] ?? r.rule.summary}</span>
                  </li>
                ))}
              </ul>
            )}
            {toConfirm.length > LIMITS.confirm && <Empty>+{toConfirm.length - LIMITS.confirm} more in RegWise.</Empty>}
          </Section>

          <Section title="Law and rule changes that affect you" count={radar.state === "ready" ? radarItems.length : undefined}>
            {radar.state !== "ready" ? (
              <Empty>Regulatory Radar was unavailable when this briefing was prepared.</Empty>
            ) : radarItems.length === 0 ? (
              <Empty>No new changes affect your business right now.</Empty>
            ) : (
              <ul className="space-y-1.5 text-[11px]">
                {radarItems.slice(0, LIMITS.radar).map(({ item, reason, actionNeeded }) => (
                  <li key={item.id}>
                    <p className="font-semibold text-slate-900">
                      {item.title.length > 90 ? `${item.title.slice(0, 88)}…` : item.title}
                      {item.citation && <span className="font-normal text-slate-500"> ({item.citation.split(",")[0]})</span>}
                    </p>
                    <p className="text-slate-600">
                      {item.effectiveDate && `Takes effect ${formatDate(item.effectiveDate)}. `}
                      {actionNeeded ?? reason}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {radarItems.length > LIMITS.radar && <Empty>+{radarItems.length - LIMITS.radar} more in RegWise.</Empty>}
          </Section>

          <Section title="Nearby projects to watch" count={risk.state === "ready" ? riskItems.length : undefined}>
            {risk.state !== "ready" ? (
              <Empty>Local Risk was unavailable when this briefing was prepared.</Empty>
            ) : riskItems.length === 0 ? (
              <Empty>No high- or medium-risk projects near your address.</Empty>
            ) : (
              <ul className="space-y-1.5 text-[11px]">
                {riskItems.slice(0, LIMITS.risk).map((i) => (
                  <li key={i.id}>
                    <p className="font-semibold text-slate-900">
                      <span className={i.riskLevel === "high" ? "text-rose-700" : "text-amber-700"}>{i.riskLevel === "high" ? "High" : "Medium"}</span> ·{" "}
                      {i.title.length > 70 ? `${i.title.slice(0, 68)}…` : i.title}
                    </p>
                    <p className="text-slate-600">
                      {CATEGORY_LABEL[i.category]} · {miles(i.distanceMeters)} away
                      {i.startDate && ` · starts ${formatDate(i.startDate.slice(0, 10))}`}
                      {i.endDate && ` · ends ${formatDate(i.endDate.slice(0, 10))}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {riskItems.length > LIMITS.risk && <Empty>+{riskItems.length - LIMITS.risk} more in RegWise.</Empty>}
            {risk.state === "ready" && risk.value.coverage === "limited" && <Empty>Local project data is limited for this area.</Empty>}
          </Section>
        </div>

        <footer className="border-t border-slate-200 pt-2 text-[10px] leading-snug text-slate-500">
          Prepared by RegWise from official sources: Maryland agencies, the Maryland Register, the General Assembly, and county and state
          permit data. Each item links to its source in RegWise. Risk levels are rule-based estimates from distance, project type, and timing.{" "}
          <strong className="text-slate-700">Information, not legal advice.</strong> Confirm details with the official source or a qualified
          professional.
        </footer>
      </article>
    </div>
  );
}
