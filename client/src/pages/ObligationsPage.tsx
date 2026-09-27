import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ObligationResult } from "../../../shared/types";
import FilingSchedule, { Details, WhereLink, type OnDone } from "../components/FilingSchedule";
import { daysLabel, daysUntil, formatDate, parseDay } from "../components/dates";
import { IconAlert, IconCalendar, IconCheck, IconChevron, IconClipboard, IconDownload, IconInfo, IconMapPin } from "../components/icons";
import { LiveStatusBar, VerificationBadge, needsBadge } from "../components/LiveStatus";
import { jurisdictionLabel } from "../components/profileOptions";
import { firstSentence } from "../components/text";
import { allUpcoming } from "../components/schedule";
import { Card, LoadingPage, Notice, PageHeader, buttonStyles } from "../components/ui";
import { useObligations } from "../components/useObligations";

// Rules you follow all the time rather than file (they may still have a
// one-off date, like putting up a poster, which shows in "Coming up").
function isEveryday(r: ObligationResult): boolean {
  if (r.status !== "affects") return false;
  return r.rule.frequency === "ongoing" || (r.rule.frequency === "every_payroll" && r.upcoming.length === 0);
}

function Section({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-lg text-brand-600">{icon}</span>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ExpandableCard({ r, tone, onDone }: { r: ObligationResult; tone: "green" | "amber"; onDone: OnDone }) {
  const [open, setOpen] = useState(false);
  const bar = tone === "green" ? "bg-emerald-500" : "bg-amber-400";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-2 p-4 pl-5 text-left">
        <span className="flex-1">
          <span className="block font-semibold text-slate-900">{r.rule.title}</span>
          {needsBadge(r.verification) && (
            <span className="mt-1.5 block">
              <VerificationBadge v={r.verification} />
            </span>
          )}
          <span className="mt-1 block text-sm text-slate-600">{tone === "amber" ? firstSentence(r.rule.summary) : r.rule.action}</span>
        </span>
        <IconChevron className={`mt-1 shrink-0 text-slate-400 transition ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="animate-fade-up border-t border-slate-100 bg-slate-50/60 p-4 pl-5">
          <Details r={r} onDone={onDone} />
        </div>
      )}
    </div>
  );
}

export default function ObligationsPage() {
  const { data, profile, error, checking, checkNow, markDone } = useObligations();
  const [showDone, setShowDone] = useState(false);

  if (error) return <Notice tone="red">{error}</Notice>;
  if (!data || !profile) return <LoadingPage />;

  const affects = data.results.filter((r) => r.status === "affects");
  const might = data.results.filter((r) => r.status === "might");
  const everyday = affects.filter(isEveryday);
  const schedule = affects.filter((r) => !isEveryday(r));

  // Due in the next 45 days (at least the next 3 dates).
  const upcoming = allUpcoming(affects);
  const soon = upcoming.filter((u) => daysUntil(u.date) <= 45);
  const comingUp = soon.length >= 3 ? soon : upcoming.slice(0, 3);

  return (
    <div className="space-y-12">
      <div className="space-y-3">
        <PageHeader
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <IconMapPin /> {jurisdictionLabel(profile.jurisdiction)}, Maryland
            </span>
          }
          title="What your business needs to do"
          subtitle={
            <>
              For {profile.businessName} ·{" "}
              <Link to="/settings" className="font-medium text-brand-700 hover:underline">
                Edit business details
              </Link>
            </>
          }
          actions={
            <a href="/api/obligations/calendar.ics" download="regwise-deadlines.ics" className={buttonStyles.secondary}>
              <IconDownload /> Add deadlines to my calendar
            </a>
          }
        />
        <LiveStatusBar data={data} checking={checking} onCheck={checkNow} />
      </div>

      <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-5">
        <p className="text-lg text-slate-700">
          <strong className="text-2xl font-bold text-slate-900">{affects.length}</strong> {affects.length === 1 ? "thing applies" : "things apply"} to your business
        </p>
        <p className="text-slate-600">
          <strong className="text-rose-600">{soon.length}</strong> due in the next 45 days
        </p>
        {might.length > 0 && (
          <p className="text-slate-600">
            <strong className="text-amber-600">{might.length}</strong> to double-check
          </p>
        )}
      </Card>

      {data.coverageNotes.length > 0 && (
        <p className="-mt-8 flex items-start gap-1.5 text-xs text-slate-500">
          <IconInfo className="mt-0.5 shrink-0" />
          <span>{data.coverageNotes.join(" ")}</span>
        </p>
      )}

      <Section icon={<IconCalendar />} title="Coming up" subtitle="Your next deadlines. Handle these first.">
        {comingUp.length === 0 ? (
          <p className="text-slate-500">No upcoming deadlines.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {comingUp.map((u) => {
              const d = parseDay(u.date);
              const urgent = daysUntil(u.date) <= 14;
              return (
                <div key={u.date + u.label} className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                  <div className="flex items-center gap-3">
                    <div className={`w-14 shrink-0 rounded-xl py-1.5 text-center ${urgent ? "bg-rose-50 text-rose-700" : "bg-brand-50 text-brand-700"}`}>
                      <p className="text-[11px] font-semibold uppercase">{d.toLocaleDateString("en-US", { month: "short" })}</p>
                      <p className="text-xl leading-tight font-bold">{d.getDate()}</p>
                    </div>
                    <p className={`text-sm font-semibold ${urgent ? "text-rose-600" : "text-slate-500"}`}>Due {daysLabel(u.date)}</p>
                  </div>
                  <p className="mt-3 font-semibold text-slate-900">{u.label}</p>
                  <p className="mt-1 line-clamp-3 flex-1 text-sm text-slate-600">{u.result.rule.action}</p>
                  <WhereLink r={u.result} className="mt-3 text-sm" />
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        icon={<IconClipboard />}
        title="Your filings and renewals"
        subtitle="Everything you file, pay, or renew, soonest first. Click a row to see what to do."
      >
        <FilingSchedule results={schedule} onDone={markDone} />
        <p className="mt-3 text-xs text-slate-500">
          Dates on weekends or holidays move to the next business day. Some agencies set your filing schedule (for example sales tax), so follow any
          notice they send you.
        </p>
      </Section>

      {everyday.length > 0 && (
        <Section icon={<IconCheck />} title="Rules to follow every day" subtitle="No form to file, but you need to keep doing these.">
          <div className="grid gap-3 md:grid-cols-2">
            {everyday.map((r) => (
              <ExpandableCard key={r.rule.id} r={r} tone="green" onDone={markDone} />
            ))}
          </div>
        </Section>
      )}

      {might.length > 0 && (
        <Section icon={<IconAlert />} title="Double-check these" subtitle="These might apply, depending on details we don't ask about.">
          <div className="grid gap-3 md:grid-cols-2">
            {might.map((r) => (
              <ExpandableCard key={r.rule.id} r={r} tone="amber" onDone={markDone} />
            ))}
          </div>
        </Section>
      )}

      {data.completed.length > 0 && (
        <section>
          <button onClick={() => setShowDone(!showDone)} className="flex items-center gap-2 text-left" aria-expanded={showDone}>
            <IconChevron className={`text-slate-400 transition ${showDone ? "rotate-90" : ""}`} />
            <span className="font-semibold text-slate-600">Done ({data.completed.length})</span>
          </button>
          {showDone && (
            <Card className="mt-3 divide-y divide-slate-100">
              {data.completed.map((c) => (
                <div key={c.ruleId} className="flex items-center justify-between gap-3 px-5 py-3">
                  <p className="text-sm text-slate-700">
                    <IconCheck className="mr-1.5 inline text-emerald-600" />
                    {c.title}
                  </p>
                  <button onClick={() => markDone(c.ruleId, false)} className="shrink-0 text-xs font-semibold text-brand-700 hover:underline">
                    Undo
                  </button>
                </div>
              ))}
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
