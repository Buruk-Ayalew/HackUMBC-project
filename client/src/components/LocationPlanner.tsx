import { useMemo, useState } from "react";
import type {
  BusinessProfile,
  JurisdictionLookupResult,
  NewLocationResponse,
  ObligationResult,
  ObligationsResponse,
} from "../../../shared/types";
import { apiPost } from "../api";
import { diff, type Change } from "./GrowthPlanner";
import { IconExternal, IconMapPin } from "./icons";
import { MD_COUNTIES, jurisdictionLabel } from "./profileOptions";
import { firstSentence as sentence } from "./text";
import { Badge, buttonStyles } from "./ui";

type Place = BusinessProfile["jurisdiction"];

const firstSentence = (r: ObligationResult) => sentence(r.rule.summary);
const applies = (r: ObligationResult) => r.status === "affects" || r.status === "might";
const sameText = (a: ObligationResult, b: ObligationResult) => a.rule.title === b.rule.title && a.rule.summary === b.rule.summary;

// Sort every obligation that applies at the new site into exactly one group,
// so the owner sees the full list, not just what's different.
function atNewSite(data: NewLocationResponse) {
  const home = new Map(data.atHome.results.map((r) => [r.rule.id, r]));
  const starts: Change[] = [];
  const maybe: Change[] = [];
  const licenses: Change[] = [];
  const registrations: Change[] = [];
  const same: ObligationResult[] = [];
  for (const r of data.atNewLocation.results) {
    if (!applies(r)) continue;
    const h = home.get(r.rule.id);
    const from = h?.status ?? "not_applicable";
    const unchanged = !!h && h.status === r.status && sameText(h, r);
    // Licenses are grouped together whether or not the local office differs.
    if (r.rule.category === "licensing") licenses.push({ result: r, from });
    else if (!unchanged) (r.status === "affects" ? starts : maybe).push({ result: r, from });
    else if (r.rule.category === "registration") registrations.push({ result: r, from });
    else same.push(r);
  }
  const total = starts.length + maybe.length + licenses.length + registrations.length + same.length;
  const describeLicense = (r: ObligationResult) => {
    const h = home.get(r.rule.id);
    if (h && applies(h) && sameText(h, r)) return "You have this today. Check the official source to see whether the new location needs a separate one.";
    return r.rule.summary;
  };
  return { starts, maybe, licenses, registrations, same, total, describeLicense };
}

export default function LocationPlanner({ profile, baseline }: { profile: BusinessProfile; baseline: ObligationsResponse }) {
  const [address, setAddress] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [placeNote, setPlaceNote] = useState<string | null>(null);
  // The address text that `place` was looked up from ("" when a county was picked).
  const [lookedUp, setLookedUp] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [staff, setStaff] = useState(5);
  const [fullTime, setFullTime] = useState(5);
  const [data, setData] = useState<NewLocationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const typed = address.trim();
  // A typed address that hasn't been looked up yet takes priority over an earlier county pick.
  const needsLookup = typed.length >= 5 && typed !== lookedUp;

  async function lookUp(): Promise<Place | null> {
    setLooking(true);
    setLookupError(null);
    try {
      const r = await apiPost<JurisdictionLookupResult>("/api/jurisdiction/lookup", { address: typed });
      setPlace(r.jurisdiction);
      setLookedUp(typed);
      setPlaceNote(r.confidence === "check" ? `Matched "${r.matchedAddress}". Please check the county is right.` : `Matched "${r.matchedAddress}".`);
      setData(null);
      return r.jurisdiction;
    } catch (e) {
      setPlace(null);
      setLookedUp("");
      setLookupError((e as Error).message);
      return null;
    } finally {
      setLooking(false);
    }
  }

  async function run() {
    const target = needsLookup ? await lookUp() : place;
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      setData(
        await apiPost<NewLocationResponse>("/api/obligations/new-location", {
          jurisdiction: { county: target.county, municipality: target.municipality },
          employees: staff,
          fullTime,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const site = useMemo(() => (data ? atNewSite(data) : null), [data]);
  const whole = useMemo(() => (data ? diff(baseline.results, data.atHome.results) : null), [data, baseline]);
  const staffError = fullTime > staff ? "Full-time staff can't be more than staff at the new location." : null;

  const busy = looking || loading;

  return (
    <div className="space-y-6">
      {/* Controls: one bar across the top */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <label htmlFor="new-location-address" className="text-sm font-semibold text-slate-700">
              Where is the new location?
            </label>
            <p className="text-xs text-slate-500">Today you're in {jurisdictionLabel(profile.jurisdiction)}. Maryland addresses only.</p>
            <div className="mt-2 flex gap-2">
              <input
                id="new-location-address"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setLookupError(null);
                  // Editing the address invalidates the old lookup.
                  if (lookedUp && e.target.value.trim() !== lookedUp) {
                    setPlace(null);
                    setPlaceNote(null);
                    setLookedUp("");
                    setData(null);
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && typed.length >= 5 && !busy && void lookUp()}
                placeholder="Street address, city, MD"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              />
              <button onClick={() => void lookUp()} disabled={busy || typed.length < 5} className={buttonStyles.secondary}>
                {looking ? "Looking up…" : "Look up"}
              </button>
            </div>
            {lookupError && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{lookupError}</p>}
          </div>
          <label className="block min-w-0 text-sm font-semibold text-slate-700">
            Or pick a county
            <span className="block text-xs font-normal text-slate-500">County rules only, no town rules.</span>
            <select
              value={place && !placeNote ? place.county : ""}
              onChange={(e) => {
                const county = e.target.value;
                setPlace(county ? { state: "MD", county, isBaltimoreCity: county === "Baltimore City", municipality: null } : null);
                setPlaceNote(null);
                setAddress("");
                setLookedUp("");
                setLookupError(null);
                setData(null);
              }}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm"
            >
              <option value="">Choose a county…</option>
              {MD_COUNTIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>

        {place && (
          <p className="mt-3 flex min-w-0 items-start gap-1.5 rounded-xl bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
            <IconMapPin className="mt-0.5 shrink-0 text-brand-600" />
            <span className="min-w-0">
              <span className="font-semibold">{jurisdictionLabel(place)}</span>
              <span className="ml-2 break-words text-xs text-slate-500">{placeNote ?? "County only. Enter an address to include town rules."}</span>
            </span>
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          {(
            [
              ["Staff at the new location", staff, setStaff],
              ["Of those, full-time", fullTime, setFullTime],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label} className="w-40 text-xs font-medium text-slate-600">
              {label}
              <input
                type="number"
                min={0}
                value={value}
                onChange={(e) => {
                  set(Math.max(0, Math.floor(Number(e.target.value) || 0)));
                  setData(null);
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base font-semibold text-slate-900"
              />
            </label>
          ))}
          <button
            onClick={() => void run()}
            disabled={(!place && !needsLookup) || busy || !!staffError}
            className={`${buttonStyles.primary} w-full sm:w-auto sm:min-w-44`}
          >
            {looking ? "Finding the address…" : loading ? "Working it out…" : "See what changes"}
          </button>
        </div>
        {staffError && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{staffError}</p>}
      </div>

      {/* Results: full width below the controls */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
        {error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {!data || !site || !whole ? (
          <p className="text-slate-600">Enter the new address (or pick a county) and how many people would work there, then select "See what changes".</p>
        ) : (
          <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
            <div className="space-y-2">
              <h3 className="text-xl font-bold tracking-tight text-slate-900">A new location in {jurisdictionLabel(data.location)}</h3>
              <p className="text-sm text-slate-600">
                <strong className="text-slate-900">{site.total} obligations</strong> would apply there. With {staff} more{" "}
                {staff === 1 ? "person" : "people"}, you would have {profile.employees.inMaryland + staff} employees in Maryland.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    [site.starts.length, "new or different", "red"],
                    [site.maybe.length, "might apply", "amber"],
                    [site.licenses.length, "licenses to check", "slate"],
                    [site.registrations.length, "registrations to update", "slate"],
                    [site.same.length, "same as today", "slate"],
                  ] as const
                )
                  .filter(([n]) => n > 0)
                  .map(([n, label, tone]) => (
                    <Badge key={label} tone={tone}>
                      {n} {label}
                    </Badge>
                  ))}
              </div>
            </div>

            <Group title="New or different at this location" tone="red" items={site.starts.map((c) => c.result)} describe={firstSentence} />
            <Group title="Might apply at this location" tone="amber" items={site.maybe.map((c) => c.result)} describe={firstSentence} />
            <Group title="Licenses to check for the new site" tone="slate" items={site.licenses.map((c) => c.result)} describe={site.describeLicense} />
            <Group
              title="Registrations and accounts to update"
              hint="You have these today. Check each source to see whether you need to add the new location or register it separately."
              tone="slate"
              items={site.registrations.map((c) => c.result)}
              describe={firstSentence}
            />

            {site.same.length > 0 && (
              <details className="group rounded-xl border border-slate-200 bg-slate-50/60">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
                  <span className="text-slate-400 transition group-open:rotate-90">&#9656;</span>
                  <span className="text-sm font-bold text-slate-900">Also applies at the new location (same as today)</span>
                  <Badge tone="slate">{site.same.length}</Badge>
                  <span className="ml-auto hidden text-xs text-slate-500 sm:inline">Show list</span>
                </summary>
                <div className="px-4 pb-4">
                  <Group
                    hint="These apply to your whole business, so include the new location when you handle them."
                    tone="slate"
                    items={site.same}
                    describe={firstSentence}
                  />
                </div>
              </details>
            )}

            {whole.starts.length + whole.maybe.length + whole.stops.length > 0 && (
              <div className="space-y-5 border-t border-slate-100 pt-5">
                <div>
                  <h4 className="text-base font-bold text-slate-900">Changes for your whole business</h4>
                  <p className="text-sm text-slate-600">Because of the extra staff, these change for every location, not just the new one.</p>
                </div>
                <Group title="New obligations" tone="red" items={whole.starts.map((c) => c.result)} describe={employeeReason} />
                <Group title="Might start applying" tone="amber" items={whole.maybe.map((c) => c.result)} describe={employeeReason} />
                <Group title="No longer applies" tone="slate" items={whole.stops.map((c) => c.result)} describe={employeeReason} />
              </div>
            )}

            <p className="text-xs text-slate-500">
              Not included: building, zoning, occupancy, and sign permits for the new space. We don't have rules for these yet, so check with the
              county or town where the new location is.
            </p>
          </div>
        )}
        <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500">
          Each law counts employees differently. These are estimates; check each rule's source.
        </p>
      </div>
    </div>
  );
}

const employeeReason = (r: ObligationResult) => r.reasons.find((x) => /employee/.test(x)) ?? r.reasons[0] ?? "";

const DOT = { red: "bg-rose-500", amber: "bg-amber-400", slate: "bg-slate-400" } as const;

// One group of obligations: a small heading, then a compact list with each
// item's title, a one-line explanation, and its official source.
function Group({
  title,
  hint,
  tone,
  items,
  describe,
}: {
  title?: string;
  hint?: string;
  tone: keyof typeof DOT;
  items: ObligationResult[];
  describe: (r: ObligationResult) => string;
}) {
  if (!items.length) return null;
  return (
    <section className="animate-fade-up">
      {title && (
        <div className="mb-2 flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[tone]}`} />
          <h4 className="text-sm font-bold text-slate-900">{title}</h4>
          <Badge tone={tone}>{items.length}</Badge>
        </div>
      )}
      {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {items.map((r) => (
          <li key={r.rule.id} className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {r.rule.title}
                {r.status === "might" && tone !== "amber" && (
                  <span className="ml-2 align-middle">
                    <Badge tone="amber">Might apply</Badge>
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">{describe(r)}</p>
            </div>
            <a
              href={r.rule.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
              aria-label={`Official source for ${r.rule.title}`}
            >
              Source <IconExternal />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
