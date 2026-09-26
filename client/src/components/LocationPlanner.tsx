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
import { Badge, buttonStyles } from "./ui";

type Place = BusinessProfile["jurisdiction"];

const firstSentence = (r: ObligationResult) => r.rule.summary.split(". ")[0]!.replace(/\.$/, "") + ".";
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
  const [looking, setLooking] = useState(false);
  const [staff, setStaff] = useState(5);
  const [fullTime, setFullTime] = useState(5);
  const [data, setData] = useState<NewLocationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookUp() {
    setLooking(true);
    setError(null);
    try {
      const r = await apiPost<JurisdictionLookupResult>("/api/jurisdiction/lookup", { address });
      setPlace(r.jurisdiction);
      setPlaceNote(r.confidence === "check" ? `Matched "${r.matchedAddress}". Please check the county is right.` : `Matched "${r.matchedAddress}".`);
      setData(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLooking(false);
    }
  }

  async function run() {
    if (!place) return;
    setLoading(true);
    setError(null);
    try {
      setData(
        await apiPost<NewLocationResponse>("/api/obligations/new-location", {
          jurisdiction: { county: place.county, municipality: place.municipality },
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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Controls */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <div>
          <p className="text-sm font-semibold text-slate-700">Where is the new location?</p>
          <p className="text-sm text-slate-500">
            Today you're in {jurisdictionLabel(profile.jurisdiction)}. Maryland addresses only.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && address.trim().length >= 5 && void lookUp()}
              placeholder="Street address, city, MD"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
            />
            <button onClick={lookUp} disabled={looking || address.trim().length < 5} className={buttonStyles.secondary}>
              {looking ? "Looking up…" : "Look up"}
            </button>
          </div>
          <label className="mt-3 block text-xs font-medium text-slate-600">
            Or pick a county
            <select
              value={place && !placeNote ? place.county : ""}
              onChange={(e) => {
                const county = e.target.value;
                setPlace(county ? { state: "MD", county, isBaltimoreCity: county === "Baltimore City", municipality: null } : null);
                setPlaceNote(null);
                setData(null);
              }}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
            >
              <option value="">Choose a county…</option>
              {MD_COUNTIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          {place && (
            <p className="mt-3 inline-flex items-start gap-1.5 rounded-xl bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">
              <IconMapPin className="mt-0.5 shrink-0 text-brand-600" />
              <span>
                <span className="font-semibold">{jurisdictionLabel(place)}</span>
                {placeNote && <span className="block text-xs text-slate-500">{placeNote}</span>}
                {!placeNote && <span className="block text-xs text-slate-500">County only. Enter an address to include town rules.</span>}
              </span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["Staff at the new location", staff, setStaff],
              ["Of those, full-time", fullTime, setFullTime],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label} className="text-xs font-medium text-slate-600">
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
        </div>
        {staffError && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{staffError}</p>}

        <button onClick={run} disabled={!place || loading || !!staffError} className={`${buttonStyles.primary} w-full`}>
          {loading ? "Working it out…" : "See what changes"}
        </button>
      </div>

      {/* Results */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
        {error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {!data || !site || !whole ? (
          <p className="text-slate-600">Choose where the new location would be and how many people would work there, then select "See what changes".</p>
        ) : (
          <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
            <div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900">A new location in {jurisdictionLabel(data.location)}</h3>
              <p className="text-sm text-slate-500">
                With {staff} more {staff === 1 ? "person" : "people"}, you'd have {profile.employees.inMaryland + staff} employees in Maryland.
              </p>
            </div>
            {data.atNewLocation.coverageNotes.map((n) => (
              <p key={n} className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                {n}
              </p>
            ))}
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
              <strong className="text-slate-900">{site.total} obligations</strong> would apply at the new location:{" "}
              {[
                [site.starts.length, "new or different"],
                [site.maybe.length, "might apply"],
                [site.licenses.length, "licenses"],
                [site.registrations.length, "registrations"],
                [site.same.length, "same as today"],
              ]
                .filter(([n]) => n)
                .map(([n, l]) => `${n} ${l}`)
                .join(" · ")}
              .
            </p>

            <div className="space-y-5">
              <ChangeGroup title="New or different at this location" tone="red" items={site.starts} describe={firstSentence} />
              <ChangeGroup title="Might apply at this location" tone="amber" items={site.maybe} describe={firstSentence} />
              <ChangeGroup
                title="Licenses to check for the new site"
                tone="slate"
                items={site.licenses}
                describe={site.describeLicense}
              />
              <ChangeGroup
                title="Registrations and accounts to update"
                tone="slate"
                items={site.registrations}
                describe={() => "You have this today. Check the official source to see whether you need to add the new location or register it separately."}
              />
              <SameList items={site.same} />
            </div>

            <p className="text-xs text-slate-500">
              Not included: building, zoning, occupancy, and sign permits for the new space. We don't have rules for these yet, so check with the
              county or town where the new location is.
            </p>

            {whole.starts.length + whole.maybe.length + whole.stops.length > 0 && (
              <div className="space-y-5 border-t border-slate-100 pt-5">
                <p className="text-sm font-semibold text-slate-700">Changes for your whole business (because of the extra staff)</p>
                <ChangeGroup title="New obligations" tone="red" items={whole.starts} />
                <ChangeGroup title="Might start applying" tone="amber" items={whole.maybe} />
                <ChangeGroup title="No longer applies" tone="slate" items={whole.stops} />
              </div>
            )}
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
    <section className="animate-fade-up">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-sm font-bold text-slate-900">Also applies at the new location (same as today)</h4>
        <Badge tone="slate">{items.length}</Badge>
      </div>
      <p className="mb-2 text-xs text-slate-500">These apply to your whole business, so include the new location when you handle them.</p>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
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
    </section>
  );
}
