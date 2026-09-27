import { useMemo, useState } from "react";
import type {
  BusinessProfile,
  JurisdictionLookupResult,
  NewLocationResponse,
  ObligationResult,
  ObligationsResponse,
} from "../../../shared/types";
import { apiPost } from "../api";
import { ChangeGroup, diff, type Change } from "./GrowthPlanner";
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
          {place && (
            <p className="inline-flex min-w-0 items-start gap-1.5 rounded-xl bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
              <IconMapPin className="mt-0.5 shrink-0 text-brand-600" />
              <span className="min-w-0">
                <span className="font-semibold">{jurisdictionLabel(place)}</span>
                <span className="block break-words text-xs text-slate-500">
                  {placeNote ?? "County only. Enter an address to include town rules."}
                </span>
              </span>
            </p>
          )}
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
            <div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900">A new location in {jurisdictionLabel(data.location)}</h3>
              <p className="text-sm text-slate-500">
                With {staff} more {staff === 1 ? "person" : "people"}, you'd have {profile.employees.inMaryland + staff} employees in Maryland.
              </p>
            </div>

            {/* At-a-glance counts */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {(
                [
                  [site.total, "apply at the new site", "bg-slate-900 text-white"],
                  [site.starts.length, "new or different", "bg-rose-50 text-rose-800"],
                  [site.maybe.length, "might apply", "bg-amber-50 text-amber-800"],
                  [site.licenses.length, "licenses to check", "bg-slate-50 text-slate-800"],
                  [site.registrations.length, "registrations", "bg-slate-50 text-slate-800"],
                  [site.same.length, "same as today", "bg-slate-50 text-slate-800"],
                ] as const
              ).map(([n, label, tone]) => (
                <div key={label} className={`rounded-xl px-3 py-2 ${tone}`}>
                  <p className="text-xl font-bold">{n}</p>
                  <p className="text-xs opacity-80">{label}</p>
                </div>
              ))}
            </div>

            {/* Groups side by side on wide screens */}
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <ChangeGroup title="New or different at this location" tone="red" items={site.starts} describe={firstSentence} />
              <ChangeGroup title="Might apply at this location" tone="amber" items={site.maybe} describe={firstSentence} />
              <ChangeGroup title="Licenses to check for the new site" tone="slate" items={site.licenses} describe={site.describeLicense} />
              <ChangeGroup
                title="Registrations and accounts to update"
                tone="slate"
                items={site.registrations}
                describe={() => "You have this today. Check the official source to see whether you need to add the new location or register it separately."}
              />
            </div>

            <SameList items={site.same} />

            {whole.starts.length + whole.maybe.length + whole.stops.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="mb-3 text-sm font-semibold text-slate-700">Changes for your whole business (because of the extra staff)</p>
                <div className="grid items-start gap-6 lg:grid-cols-3">
                  <ChangeGroup title="New obligations" tone="red" items={whole.starts} />
                  <ChangeGroup title="Might start applying" tone="amber" items={whole.maybe} />
                  <ChangeGroup title="No longer applies" tone="slate" items={whole.stops} />
                </div>
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

// Obligations that apply the same way at the new site as they do today.
function SameList({ items }: { items: ObligationResult[] }) {
  if (!items.length) return null;
  return (
    <details className="group animate-fade-up rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
        <span className="text-slate-400 transition group-open:rotate-90">▸</span>
        <h4 className="text-sm font-bold text-slate-900">Also applies at the new location (same as today)</h4>
        <Badge tone="slate">{items.length}</Badge>
        <span className="ml-auto hidden text-xs text-slate-500 sm:inline">Show list</span>
      </summary>
      <p className="px-4 pb-2 text-xs text-slate-500">These apply to your whole business, so include the new location when you handle them.</p>
      <ul className="grid border-t border-slate-100 md:grid-cols-2 md:divide-x md:divide-slate-100 [&>li]:border-b [&>li]:border-slate-100">
        {items.map((r) => (
          <li key={r.rule.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900">
                {r.rule.title}
                {r.status === "might" && (
                  <span className="ml-2 align-middle">
                    <Badge tone="amber">Might apply</Badge>
                  </span>
                )}
              </span>
              <span className="block text-xs text-slate-500">{firstSentence(r)}</span>
            </span>
            <a href={r.rule.sourceUrl} target="_blank" rel="noreferrer" className="mt-0.5 shrink-0 text-brand-700 hover:text-brand-800" aria-label={`Official source for ${r.rule.title}`}>
              <IconExternal />
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
