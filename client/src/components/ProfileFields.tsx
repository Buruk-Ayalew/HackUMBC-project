import { useState, type ReactNode } from "react";
import type { JurisdictionLookupResult } from "../../../shared/types";
import { apiPost } from "../api";
import MiniMap from "./MiniMap";
import {
  ENTITY_OPTIONS,
  FLAG_QUESTIONS,
  FMLA_OPTIONS,
  INDUSTRY_OPTIONS,
  MD_COUNTIES,
  jurisdictionLabel,
  type ProfileDraft,
} from "./profileOptions";

export const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-200 focus:outline-none";

export function Field({ label, why, children }: { label: string; why?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="font-medium text-slate-800">{label}</span>
      {why && <span className="block text-sm text-slate-500">{why}</span>}
      {children}
    </label>
  );
}

type Update = (patch: Partial<ProfileDraft>) => void;

export function BusinessFields({ draft, update }: { draft: ProfileDraft; update: Update }) {
  return (
    <div className="space-y-5">
      <Field label="Business name" why="So we can show it on your results.">
        <input className={inputClass} value={draft.businessName} onChange={(e) => update({ businessName: e.target.value })} />
      </Field>
      <Field label="What type of business entity is it?" why="Some filings, like the SDAT annual report, depend on this.">
        <select
          className={inputClass}
          value={draft.entityType}
          onChange={(e) => update({ entityType: e.target.value as ProfileDraft["entityType"] })}
        >
          {ENTITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What kind of business is it?" why="Some rules only apply to certain industries.">
        <select
          className={inputClass}
          value={draft.industry}
          onChange={(e) => {
            const opt = INDUSTRY_OPTIONS.find((o) => o.value === e.target.value);
            update({ industry: e.target.value, naicsCode: opt?.naics });
          }}
        >
          <option value="" disabled>
            Choose one…
          </option>
          {INDUSTRY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

// Address entry, lookup, map, and user confirmation.
export function LocationFields({
  draft,
  update,
  confirmed,
  setConfirmed,
}: {
  draft: ProfileDraft;
  update: Update;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
}) {
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<JurisdictionLookupResult | null>(null);
  const [editing, setEditing] = useState(false);
  const hasLocation = draft.jurisdiction.county !== "";

  async function runLookup() {
    setError(null);
    setLooking(true);
    try {
      const r = await apiPost<JurisdictionLookupResult>("/api/jurisdiction/lookup", { address: draft.address });
      setLookup(r);
      update({ lat: r.lat, lng: r.lng, jurisdiction: r.jurisdiction });
      setConfirmed(false);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLooking(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Business street address" why="Local rules, taxes, and nearby projects depend on exactly where you are.">
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input
            className={`${inputClass} mt-0`}
            placeholder="e.g. 1621 Thames St, Baltimore, MD 21231"
            value={draft.address}
            onChange={(e) => {
              update({ address: e.target.value });
              setConfirmed(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runLookup();
              }
            }}
          />
          <button
            type="button"
            onClick={runLookup}
            disabled={looking || draft.address.trim().length < 5}
            className="shrink-0 rounded-md bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {looking ? "Looking up…" : "Look up address"}
          </button>
        </div>
      </Field>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {hasLocation && !error && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          {lookup && <p className="text-sm text-slate-500">Matched: {lookup.matchedAddress}</p>}
          <p className="text-lg">
            We found: <strong>{jurisdictionLabel(draft.jurisdiction)}</strong>
          </p>
          {draft.lat !== 0 && <MiniMap lat={draft.lat} lng={draft.lng} />}
          {lookup?.confidence === "check" && (
            <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">Please double-check this location.</p>
          )}
          {lookup?.notes.map((n) => (
            <p key={n} className="text-sm text-slate-500">
              {n}
            </p>
          ))}

          {editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="County">
                <select
                  className={inputClass}
                  value={draft.jurisdiction.county}
                  onChange={(e) =>
                    update({
                      jurisdiction: {
                        ...draft.jurisdiction,
                        county: e.target.value,
                        isBaltimoreCity: e.target.value === "Baltimore City",
                        municipality: e.target.value === "Baltimore City" ? null : draft.jurisdiction.municipality,
                      },
                    })
                  }
                >
                  {MD_COUNTIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Incorporated town or city (leave blank if none)">
                <input
                  className={inputClass}
                  value={draft.jurisdiction.municipality ?? ""}
                  disabled={draft.jurisdiction.isBaltimoreCity}
                  onChange={(e) =>
                    update({ jurisdiction: { ...draft.jurisdiction, municipality: e.target.value.trim() ? e.target.value : null } })
                  }
                />
              </Field>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmed(true);
                setEditing(false);
              }}
              className={`rounded-md px-4 py-2 font-medium ${confirmed ? "bg-green-700 text-white" : "bg-green-600 text-white hover:bg-green-700"}`}
            >
              {confirmed ? "✓ Location confirmed" : "Yes, that's right"}
            </button>
            {!editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setConfirmed(false);
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
              >
                No, let me fix it
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      min={0}
      step={1}
      inputMode="numeric"
      className={`${inputClass} max-w-40`}
      value={Number.isNaN(value) ? "" : value}
      onChange={(e) => onChange(e.target.value === "" ? NaN : Math.floor(Number(e.target.value)))}
    />
  );
}

export function EmployeeFields({ draft, update }: { draft: ProfileDraft; update: Update }) {
  const e = draft.employees;
  const set = (patch: Partial<ProfileDraft["employees"]>) => update({ employees: { ...e, ...patch } });
  return (
    <div className="space-y-5">
      <Field
        label="How many people work for your business in total, in all states?"
        why="Used for Maryland paid family leave (FAMLI), which counts everyone under your tax ID. Don't count yourself if you're the only owner and not on payroll."
      >
        <NumberInput value={e.totalAllStates} onChange={(n) => set({ totalAllStates: n })} />
      </Field>
      <Field label="How many of them work mainly in Maryland?" why="Used for sick and safe leave, parental leave, and minimum wage.">
        <NumberInput value={e.inMaryland} onChange={(n) => set({ inMaryland: n })} />
      </Field>
      <Field label="How many of those are full-time?" why="Used for hiring rules like 'ban the box'.">
        <NumberInput value={e.fullTimeInMaryland} onChange={(n) => set({ fullTimeInMaryland: n })} />
      </Field>
      <fieldset>
        <legend className="font-medium text-slate-800">Is your business covered by the federal Family and Medical Leave Act (FMLA)?</legend>
        <p className="text-sm text-slate-500">Usually yes if you had 50+ employees for 20+ weeks this year or last.</p>
        <div className="mt-2 flex gap-2">
          {FMLA_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => set({ coveredByFMLA: o.value })}
              className={`rounded-md border px-4 py-2 ${e.coveredByFMLA === o.value ? "border-blue-700 bg-blue-50 font-semibold text-blue-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function FlagFields({ draft, update }: { draft: ProfileDraft; update: Update }) {
  return (
    <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {FLAG_QUESTIONS.map((q) => {
        const on = draft.flags[q.key];
        return (
          <div key={q.key} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium text-slate-800">{q.question}</p>
              <p className="text-sm text-slate-500">{q.why}</p>
            </div>
            <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-300">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={on === v}
                  onClick={() => update({ flags: { ...draft.flags, [q.key]: v } })}
                  className={`px-3 py-1.5 text-sm ${on === v ? "bg-blue-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
