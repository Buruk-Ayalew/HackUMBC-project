import type { ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { IconArrowRight, IconBuilding, IconCalendar, IconCheck, IconClipboard, IconExternal, IconMapPin, IconRadar, IconTrending } from "../components/icons";
import { Badge, buttonStyles } from "../components/ui";

const PREVIEW = [
  { title: "Sales tax return for Q3 2026", when: "Oct 20", tone: "bg-rose-100 text-rose-700" },
  { title: "Unemployment insurance report for Q3 2026", when: "Nov 2", tone: "bg-amber-100 text-amber-800" },
  { title: "Last day to choose a private FAMLI plan", when: "Nov 15", tone: "bg-amber-100 text-amber-800" },
  { title: "SDAT annual report for 2027", when: "Apr 15", tone: "bg-slate-100 text-slate-700" },
];

// Agencies whose official pages the rules and checks come from, by level.
// Names link to each agency's own site (no agency logos: they'd imply endorsement).
const SOURCE_GROUPS: { level: string; tint: string; agencies: { name: string; url?: string }[] }[] = [
  {
    level: "Federal",
    tint: "bg-brand-50 text-brand-600",
    agencies: [
      { name: "Internal Revenue Service (IRS)", url: "https://www.irs.gov/" },
      { name: "U.S. Department of Labor", url: "https://www.dol.gov/" },
    ],
  },
  {
    level: "State",
    tint: "bg-sky-50 text-sky-600",
    agencies: [
      { name: "Comptroller of Maryland", url: "https://www.marylandcomptroller.gov/" },
      { name: "Maryland Department of Labor", url: "https://labor.maryland.gov/" },
      { name: "State Department of Assessments and Taxation", url: "https://dat.maryland.gov/" },
      { name: "Maryland General Assembly", url: "https://mgaleg.maryland.gov/" },
    ],
  },
  {
    level: "Local",
    tint: "bg-emerald-50 text-emerald-700",
    agencies: [
      { name: "County Health Departments", url: "https://health.maryland.gov/pages/departments.aspx" },
      { name: "Local Liquor Boards", url: "https://atcc.maryland.gov/org-directory/maryland-counties-liquor-board-directory/" },
      { name: "City and Town Governments" },
    ],
  },
];

// A small product preview. Labeled so no one mistakes example data for real data.
function Preview({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-lift">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Example</span>
      </div>
      {children}
    </div>
  );
}

function Feature({
  icon,
  accent,
  title,
  text,
  points,
  link,
  preview,
  flip = false,
}: {
  icon: ReactNode;
  accent: string;
  title: string;
  text: string;
  points: string[];
  link: string;
  preview: ReactNode;
  flip?: boolean;
}) {
  return (
    <section className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={flip ? "lg:order-2" : ""}>
        <span className={`grid h-11 w-11 place-items-center rounded-xl text-2xl ${accent}`}>{icon}</span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
        <p className="mt-3 max-w-xl text-lg text-slate-600">{text}</p>
        <ul className="mt-5 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-slate-700">
              <IconCheck className="mt-1 shrink-0 text-emerald-600" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <Link to="/login?mode=register" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline">
          {link}
        </Link>
      </div>
      <div className={flip ? "lg:order-1" : ""}>{preview}</div>
    </section>
  );
}

export default function WelcomePage() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="-mt-8 space-y-24">
      <section className="relative -mx-4 px-4 pt-14 pb-10 sm:pt-20">
        {/* Soft glow behind the hero. It spans the full window width (not just this
            section) and is sized to that box, so it fades out before any edge. */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-[radial-gradient(ellipse_60%_95%_at_50%_0%,var(--color-brand-100)_0%,color-mix(in_srgb,var(--color-brand-100)_60%,transparent)_30%,color-mix(in_srgb,var(--color-brand-100)_25%,transparent)_55%,transparent_75%)]" />
        <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
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
            <div className="pointer-events-none absolute -inset-12 -z-10 bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-brand-200)_55%,transparent),color-mix(in_srgb,#e0f2fe_40%,transparent)_60%,transparent)] blur-2xl" />
            <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-lift">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Thames Street Kitchen, Baltimore City</p>
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
            </div>
          </div>
        </div>
      </section>

      {/* Where the information comes from */}
      <section>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Checked Against the Agencies That Set the Rules</h2>
        <div className="mt-8 grid grid-cols-1 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-card md:grid-cols-3 md:divide-x md:divide-slate-100">
          {SOURCE_GROUPS.map((g, i) => (
            <div key={g.level} className={`p-6 sm:p-7 ${i > 0 ? "border-t border-slate-100 md:border-t-0" : ""}`}>
              <div className="flex items-center gap-3">
                <span className={`grid h-10 w-10 place-items-center rounded-xl text-xl ${g.tint}`}>
                  <IconBuilding />
                </span>
                <h3 className="text-lg font-bold text-slate-900">{g.level}</h3>
              </div>
              <ul className="mt-4 space-y-2.5">
                {g.agencies.map((a) => (
                  <li key={a.name}>
                    {a.url ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group inline-flex items-start gap-1.5 font-medium text-slate-700 hover:text-brand-700"
                      >
                        <span className="group-hover:underline">{a.name}</span>
                        <IconExternal className="mt-1 shrink-0 text-xs text-slate-400 group-hover:text-brand-600" />
                      </a>
                    ) : (
                      <span className="font-medium text-slate-700">{a.name}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <Feature
        icon={<IconClipboard />}
        accent="bg-rose-50 text-rose-600"
        title="Know exactly what your business owes"
        text="Every registration, filing, payment, and posting that applies to you, in plain language, with the due date and where to file."
        points={[
          "Amounts like minimum wage and tax rates are read from official pages every day",
          "Due dates move to the next business day for weekends and holidays",
          "Mark one-time items done, and see which records to keep and for how long",
          "Add every deadline to your own calendar in one click",
        ]}
        link="See what applies to you"
        preview={
          <Preview title="Your filings and renewals">
            <p className="mb-3 inline-flex items-center gap-1.5 text-xs text-slate-500">
              <IconCheck className="text-emerald-600" /> Checked live today at 9:02 AM
            </p>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {[
                ["Send Maryland tax withheld from paychecks", "Monthly", "Oct 15"],
                ["File your sales tax return", "Quarterly", "Oct 20"],
                ["Pay at least the county minimum wage ($15.95 an hour)", "Ongoing", "Every payroll"],
              ].map(([what, often, due]) => (
                <li key={what} className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800">{what}</span>
                    <span className="text-xs text-slate-500">{often}</span>
                  </span>
                  <span className="text-right text-sm font-semibold whitespace-nowrap text-slate-900">{due}</span>
                </li>
              ))}
            </ul>
          </Preview>
        }
      />

      <Feature
        flip
        icon={<IconRadar />}
        accent="bg-brand-50 text-brand-600"
        title="See new laws before they reach you"
        text="New bills, proposed and final regulations, agency news, and wage or tax-rate changes, sorted so you only see the ones that affect your business."
        points={[
          "Each change says why it applies to you",
          "Comment deadlines and hearings, so you can have your say",
          "Updates every day, and whenever you log in",
        ]}
        link="Check your Radar"
        preview={
          <Preview title="Regulatory Radar">
            <ul className="space-y-3">
              {[
                ["Bill HB 895, takes effect Oct 1, 2026", "Dynamic pricing and personal data rules for food retailers", "Applies because you sell food to consumers."],
                ["Bill SB 417, takes effect Oct 1, 2026", "Maryland Worker Freedom Act", "Applies because you have employees in Maryland."],
              ].map(([meta, title, why]) => (
                <li key={title} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="red">Affects you</Badge>
                    <span className="text-xs text-slate-500">{meta}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-slate-900">{title}</p>
                  <p className="text-sm text-slate-600">{why}</p>
                </li>
              ))}
            </ul>
          </Preview>
        }
      />

      <Feature
        icon={<IconMapPin />}
        accent="bg-sky-50 text-sky-600"
        title="Know what's happening outside your door"
        text="Construction, road work, and permitted projects near your address, plus the businesses you compete with, on one map."
        points={[
          "A clear risk level for each project, with the reasons behind it",
          "New projects nearby are flagged so nothing surprises you",
          "Competitors of the same kind as your business, not every shop on the block",
        ]}
        link="Map your area"
        preview={
          <Preview title="Near your business">
            <ul className="space-y-2">
              {[
                ["High", "red", "Road resurfacing on your street", "0.1 mi, starts next month"],
                ["Medium", "amber", "Building renovation permit", "0.3 mi, active now"],
                ["Low", "slate", "Sidewalk repair", "0.6 mi, finishing this week"],
              ].map(([level, tone, what, where]) => (
                <li key={what} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
                  <Badge tone={tone as "red" | "amber" | "slate"}>{level}</Badge>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{what}</span>
                    <span className="text-xs text-slate-500">{where}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900">4 restaurants like yours within half a mile</p>
          </Preview>
        }
      />

      <Feature
        flip
        icon={<IconTrending />}
        accent="bg-emerald-50 text-emerald-700"
        title="Plan before you hire or open another location"
        text="Rules switch on as you grow. See what starts at each headcount, and everything that would apply at a second location, before you commit."
        points={[
          "Milestones like 11, 15, and 51 employees, based on the rules themselves",
          "A full list of obligations for a new address, including local licenses",
          "What changes for your whole business because of the extra staff",
        ]}
        link="Try the Growth Planner"
        preview={
          <Preview title="Growth Planner">
            <ol className="space-y-2">
              {[
                ["15", "Pay the employer half of FAMLI", "Give paid sick leave"],
                ["100", "File the yearly EEO-1 workforce report", null],
              ].map(([n, a, b]) => (
                <li key={n} className="flex items-start gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{n}</span>
                  <span className="min-w-0 text-sm">
                    <span className="block font-semibold text-slate-900">At {n} employees</span>
                    <span className="block text-slate-600">{a}</span>
                    {b && <span className="block text-slate-600">{b}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </Preview>
        }
      />

      <section className="grid grid-cols-1 gap-8 rounded-3xl bg-slate-900 p-8 text-white sm:p-12 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Built on official sources, not guesses</h2>
          <p className="mt-3 text-slate-300">
            Every item links to the agency that publishes it and shows when we last checked it. If we don't have data for your area, we say so.
          </p>
        </div>
        <ul className="space-y-3">
          {[
            [<IconCalendar key="c" />, "Every deadline in one place, with where to file"],
            [<IconCheck key="k" />, "Built for any small business, from a one-person LLC to a growing team"],
            [<IconRadar key="r" />, "Only the changes that affect you, with the reason why"],
          ].map(([icon, text]) => (
            <li key={String(text)} className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-brand-200">{icon}</span>
              <span className="pt-1 text-slate-200">{text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="pb-8 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">See what applies to your business</h2>
        <p className="mx-auto mt-3 max-w-xl text-lg text-slate-600">It takes a few minutes: your address, what you do, and how many people work for you.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/login?mode=register" className={`${buttonStyles.primary} px-6 py-3 text-base`}>
            Get started
          </Link>
          <Link to="/login" className={`${buttonStyles.secondary} px-6 py-3 text-base`}>
            Log in
          </Link>
        </div>
      </section>
    </div>
  );
}
