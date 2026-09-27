import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { IconArrowRight, IconCalendar, IconCheck, IconClipboard, IconMapPin, IconRadar, IconTrending } from "../components/icons";
import { buttonStyles } from "../components/ui";

const CARDS = [
  {
    icon: <IconClipboard />,
    accent: "bg-rose-50 text-rose-600",
    title: "Obligations",
    text: "What you're required to do right now: registrations, filings, payments, postings, and deadlines.",
  },
  {
    icon: <IconRadar />,
    accent: "bg-brand-50 text-brand-600",
    title: "Regulatory Radar",
    text: "New and upcoming law and regulation changes, sorted by whether they affect you.",
  },
  {
    icon: <IconMapPin />,
    accent: "bg-sky-50 text-sky-600",
    title: "Local Risk",
    text: "Construction, road work, and permitted projects near your address.",
  },
];

const PREVIEW = [
  { title: "Sales tax return for Q3 2026", when: "Oct 20", tone: "bg-rose-100 text-rose-700" },
  { title: "Unemployment insurance report for Q3 2026", when: "Nov 2", tone: "bg-amber-100 text-amber-800" },
  { title: "Last day to choose a private FAMLI plan", when: "Nov 15", tone: "bg-amber-100 text-amber-800" },
  { title: "SDAT annual report for 2027", when: "Apr 15", tone: "bg-slate-100 text-slate-700" },
];

export default function WelcomePage() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="-mt-8 space-y-20">
      <section className="relative -mx-4 px-4 pt-14 pb-10 sm:pt-20">
        {/* Soft glow behind the hero. It spans the full window width (not just this
            section) and is sized to that box, so it fades out before any edge. */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-[radial-gradient(ellipse_60%_95%_at_50%_0%,var(--color-brand-100)_0%,color-mix(in_srgb,var(--color-brand-100)_60%,transparent)_30%,color-mix(in_srgb,var(--color-brand-100)_25%,transparent)_55%,transparent_75%)]" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Stay ahead of the laws and local projects that affect your business.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              Enter your address and a few details. We check state, county, and federal rules against official sources and show you exactly what
              applies, when it's due, and where to file.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login?mode=register" className={`${buttonStyles.primary} px-6 py-3 text-base`}>
                Get started <IconArrowRight />
              </Link>
              <Link to="/login" className={`${buttonStyles.secondary} px-6 py-3 text-base`}>
                Log in
              </Link>
            </div>
          </div>

          <div className="relative">
            {/* Card glow: fades out from the center (radial), so there's no solid purple block. */}
            <div className="pointer-events-none absolute -inset-12 -z-10 bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-brand-200)_55%,transparent),color-mix(in_srgb,#e0f2fe_40%,transparent)_60%,transparent)] blur-2xl" />            <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-lift">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Thames Street Kitchen · Baltimore City</p>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Example</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Upcoming filings</p>
              <ul className="mt-3 space-y-2">
                {PREVIEW.map((p) => (
                  <li key={p.title} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
                    <span className={`w-14 shrink-0 rounded-lg py-1 text-center text-xs font-bold ${p.tone}`}>{p.when}</span>
                    <span className="truncate text-sm font-medium text-slate-800">{p.title}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-center text-xs text-slate-400">Illustration of the dashboard layout</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Three things every owner needs to know</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {CARDS.map((c) => (
            <div key={c.title} className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
              <span className={`grid h-11 w-11 place-items-center rounded-xl text-2xl ${c.accent}`}>{c.icon}</span>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{c.title}</h3>
              <p className="mt-2 text-slate-600">{c.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 rounded-3xl bg-slate-900 p-8 text-white sm:p-12 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Built on official sources, not guesses</h2>
          <p className="mt-3 text-slate-300">
            Every item links to the agency that publishes it and shows when we last checked it. If we don't have data for your area, we say so.
          </p>
        </div>
        <ul className="space-y-3">
          {[
            [<IconCalendar key="c" />, "Filing schedule with next due dates and where to file"],
            [<IconTrending key="t" />, "Growth Planner shows what changes before you hire"],
            [<IconCheck key="k" />, "Any Maryland address; deepest local data in Baltimore City and County"],
          ].map(([icon, text]) => (
            <li key={String(text)} className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-brand-200">{icon}</span>
              <span className="pt-1 text-slate-200">{text}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
